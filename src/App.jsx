import React, { useState, useEffect, useRef } from 'react';

const App = () => {
    const [image, setImage] = useState(null);
    const [maxInputValue, setMaxInputValue] = useState('100');
    const [settings, setSettings] = useState({
        maxSize: 100,
        mode: 'color'
    });
    const [processing, setProcessing] = useState({
        active: false,
        progress: 0,
        total: 0,
        current: 0,
        x: 0,
        y: 0
    });
    const [showOutput, setShowOutput] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [toast, setToast] = useState(null);
    const [copyStatus, setCopyStatus] = useState('idle');

    const processingRef = useRef(false);
    const fileInputRef = useRef(null);
    const outputContentRef = useRef(null);
    const rawHtmlStringRef = useRef('');
    const outputSettingsRef = useRef({ fontSize: 10, rawWidth: 100 });
    const toastTimeoutRef = useRef(null);

    useEffect(() => {
        const handlePaste = (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    handleFile(blob);
                    break;
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    useEffect(() => {
        if (image && settings.maxSize !== undefined) {
            updatePreview();
        }
    }, [image, settings.maxSize]);

    const showToastMsg = (msg) => {
        setToast(msg);
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setToast(null), 3500);
    };

    const handleFile = (file) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                setImage({
                    src: img.src,
                    width: img.width,
                    height: img.height,
                    obj: img
                });
                reset();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    const onDrop = (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const calculateDimensions = (w, h, max) => {
        if (!max || max <= 0) return { w, h };
        if (w > h) {
            return { w: parseInt(max), h: parseInt((max / w) * h) };
        } else {
            return { w: parseInt((max / h) * w), h: parseInt(max) };
        }
    };

    const updatePreview = () => {
        if (!image) return;
        const { w, h } = calculateDimensions(image.width, image.height, settings.maxSize);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image.obj, 0, 0, w, h);
        setPreviewUrl(canvas.toDataURL());
    };

    const generate = () => {
        if (!image) return;
        if (processingRef.current) return;

        reset();
        processingRef.current = true;

        const { w, h } = calculateDimensions(image.width, image.height, settings.maxSize);

        const fontSize = window.innerWidth / w;
        outputSettingsRef.current = {
            fontSize: Math.min(fontSize, 16),
            rawWidth: w
        };

        setShowOutput(true);

        setTimeout(() => {
            if (outputContentRef.current) {
                outputContentRef.current.innerHTML = '';
            }

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image.obj, 0, 0, w, h);

            const imageData = ctx.getImageData(0, 0, w, h);
            const data = imageData.data;

            rawHtmlStringRef.current = '';

            setProcessing({
                active: true,
                progress: 0,
                total: w * h,
                current: 0,
                x: 0,
                y: 0
            });

            const processPixels = async () => {
                for (let y = 0; y < h; y++) {
                    if (!processingRef.current) break;

                    const rowDiv = document.createElement('div');
                    rowDiv.style.display = 'flex';
                    rowDiv.style.lineHeight = '0.6rem';

                    if (outputContentRef.current) {
                        outputContentRef.current.appendChild(rowDiv);
                    }

                    rawHtmlStringRef.current += `<div style="display: flex; ">`;

                    for (let x = 0; x < w; x++) {
                        if (!processingRef.current) break;

                        const i = (y * w + x) * 4;
                        const r = data[i];
                        const g = data[i + 1];
                        const b = data[i + 2];
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

                        let char = '#';
                        let color = `rgb(${r},${g},${b})`;

                        if (settings.mode === 'grayscale') {
                            color = `rgb(${gray},${gray},${gray})`;
                        } else if (settings.mode === 'ascii') {
                            const chars = ['#', '%', '0', '*', '`', ' '];
                            const index = Math.floor((gray / 255) * 5);
                            char = chars[index];
                            color = 'currentColor';
                        }

                        if (char === ' ') char = '&nbsp;';

                        const span = document.createElement('span');
                        span.style.color = color;
                        span.style.width = '0.6em';
                        span.style.display = 'inline-block';
                        span.style.textAlign = 'center';
                        span.innerHTML = char;

                        rowDiv.appendChild(span);

                        rawHtmlStringRef.current += `<span style="color: ${color}; width: 0.6em; display: inline-block; text-align: center;">${char}</span>`;

                        const processed = y * w + x + 1;
                        setProcessing(prev => ({
                            ...prev,
                            progress: Math.round((processed / (w * h)) * 100),
                            current: processed,
                            x: x,
                            y: y
                        }));

                        await new Promise(resolve => setTimeout(resolve, 0));
                    }

                    rawHtmlStringRef.current += `</div>`;
                }

                if (processingRef.current) {
                    setProcessing(prev => ({ ...prev, active: false }));
                    processingRef.current = false;
                }
            };

            processPixels();
        }, 50);
    };

    const stopProcessing = () => {
        processingRef.current = false;
        setProcessing(prev => ({ ...prev, active: false }));
    };

    const copyToClipboard = async () => {
        if (!outputContentRef.current) return;

        setCopyStatus('copying');

        try {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNode(outputContentRef.current);
            selection.removeAllRanges();
            selection.addRange(range);

            document.execCommand('copy');
            selection.removeAllRanges();

            setCopyStatus('copied');
            showToastMsg('Copied to clipboard!');

            setTimeout(() => {
                setCopyStatus('idle');
            }, 2000);
        } catch (err) {
            setCopyStatus('idle');
            showToastMsg('Failed to copy');
        }
    };

    const reset = () => {
        stopProcessing();
        setShowOutput(false);
        rawHtmlStringRef.current = '';
        setCopyStatus('idle');
        if (outputContentRef.current) {
            outputContentRef.current.innerHTML = '';
        }
    };

    const handleMaxChange = (e) => {
        const val = e.target.value;
        setMaxInputValue(val);

        const numVal = parseInt(val);
        if (!isNaN(numVal)) {
            if (numVal !== 0 && numVal < 10) {
                showToastMsg("Value must be 0 or at least 10.");
            } else if (image) {
                const maxImgDim = Math.max(image.width, image.height);
                if (numVal > maxImgDim) {
                    showToastMsg(`Value cannot exceed image size (${maxImgDim}px).`);
                }
            }
        }
    };

    const handleMaxBlur = () => {
        let numVal = parseInt(maxInputValue);
        if (isNaN(numVal)) numVal = 0;

        let finalVal = numVal;

        if (numVal !== 0 && numVal < 10) {
            finalVal = 10;
        }

        if (image) {
            const maxImgDim = Math.max(image.width, image.height);
            if (finalVal > maxImgDim) {
                finalVal = maxImgDim;
            }
        }

        setMaxInputValue(finalVal.toString());

        if (finalVal !== settings.maxSize) {
            reset();
            setSettings(s => ({ ...s, maxSize: finalVal }));
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 text-slate-800 font-sans p-6 md:p-12 flex flex-col items-center">

            {toast && (
                <div className="fixed top-6 right-6 bg-slate-800 text-white px-6 py-3 rounded-lg shadow-2xl z-[100] transform transition-all animate-[bounce_0.5s_ease-in-out]">
                    <p className="font-medium text-sm">{toast}</p>
                </div>
            )}

            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">

                <div className="p-8 border-b border-slate-100">
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Pixel Studio</h1>
                    <p className="text-slate-500 mt-2">Transform images into code-ready art</p>
                </div>

                <div className="p-8 space-y-8">

                    <div
                        className="relative w-full h-48 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center cursor-pointer transition-all hover:border-indigo-500 hover:bg-indigo-50 group"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current.click()}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleFile(e.target.files[0])}
                        />

                        {image ? (
                            <div className="flex flex-col items-center">
                                <img src={image.src} alt="Source" className="h-32 object-contain rounded shadow-sm" />
                                <p className="mt-2 text-xs font-mono text-slate-400">
                                    {image.width} x {image.height}px
                                </p>
                            </div>
                        ) : (
                            <div className="text-center p-4">
                                <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                                    <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <p className="text-sm font-medium text-slate-600">Click, paste, or drop image here</p>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <label className="block text-sm font-semibold text-slate-700">Max Size (px)</label>
                            <input
                                type="number"
                                value={maxInputValue}
                                onChange={handleMaxChange}
                                onBlur={handleMaxBlur}
                                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            />

                            <div className="pt-2">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Mode</label>
                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                    {['color', 'grayscale', 'ascii'].map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => {
                                                reset();
                                                setSettings(s => ({ ...s, mode }));
                                            }}
                                            className={`flex-1 py-1.5 text-sm font-medium rounded-md capitalize transition-all ${settings.mode === mode
                                                ? 'bg-white text-indigo-600 shadow-sm'
                                                : 'text-slate-500 hover:text-slate-700'
                                                }`}
                                        >
                                            {mode}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="block text-sm font-semibold text-slate-700">Preview Output</label>
                            <div className="h-[132px] w-full bg-slate-900 rounded-lg flex items-center justify-center border border-slate-800 overflow-hidden">
                                {previewUrl ? (
                                    <img src={previewUrl} alt="Preview" className="h-[100px] object-contain image-pixelated" style={{ imageRendering: 'pixelated' }} />
                                ) : (
                                    <span className="text-slate-600 text-xs">No image</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={generate}
                        disabled={!image || processing.active}
                        className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg shadow-indigo-500/20 transition-all transform active:scale-[0.98] ${!image
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            }`}
                    >
                        {processing.active ? 'Processing...' : 'Generate Output'}
                    </button>

                </div>
            </div>

            {showOutput && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-40 flex items-center justify-center p-4 sm:p-8">
                    <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">

                        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white z-10">
                            <h3 className="font-bold text-slate-700">Result</h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={copyToClipboard}
                                    disabled={processing.active || copyStatus !== 'idle'}
                                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${(processing.active || copyStatus !== 'idle')
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                                        }`}
                                >
                                    {copyStatus === 'idle' && 'Copy Styled Output'}
                                    {copyStatus === 'copying' && 'Copying...'}
                                    {copyStatus === 'copied' && 'Copied!'}
                                </button>
                                <button
                                    onClick={reset}
                                    className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto bg-white p-4 flex items-center justify-center text-black">
                            <div
                                ref={outputContentRef}
                                className="font-mono whitespace-pre select-text origin-top"
                                style={{
                                    fontFamily: "'Courier New', Courier, monospace",
                                    backgroundColor: '#ffffff',
                                    color: '#000000',
                                    fontSize: `${Math.max(outputSettingsRef.current.fontSize, 2)}px`,
                                    lineHeight: `${Math.max(outputSettingsRef.current.fontSize, 2)}px`
                                }}
                            />
                        </div>

                        {processing.active && (
                            <div className="absolute inset-0 bg-white/90 z-50 flex items-center justify-center p-4">
                                <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center border border-slate-200">
                                    <div className="w-12 h-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin mx-auto mb-4"></div>
                                    <h3 className="text-xl font-bold text-slate-800 mb-2">Processing Pixels</h3>

                                    <div className="w-full bg-slate-100 rounded-full h-2 mb-4 overflow-hidden">
                                        <div
                                            className="bg-indigo-600 h-full transition-all duration-100"
                                            style={{ width: `${processing.progress}%` }}
                                        ></div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 text-xs text-slate-500 font-mono text-left bg-slate-50 p-3 rounded-lg">
                                        <div>Progress: <span className="text-slate-800">{processing.progress}%</span></div>
                                        <div>Converted: <span className="text-slate-800">{processing.current}</span></div>
                                        <div>Total Px: <span className="text-slate-800">{processing.total}</span></div>
                                        <div>Coord: <span className="text-slate-800">{processing.x}, {processing.y}</span></div>
                                    </div>

                                    <button onClick={reset} className="mt-6 text-red-500 text-sm hover:text-red-600 font-medium">
                                        Cancel Operation
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}
        </div>
    );
};

export default App;