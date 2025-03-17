"use client";

import { useEffect, useRef, useState } from 'react';
import { Camera, XCircle } from 'lucide-react';
import Quagga from 'quagga';

const BarcodeScanner = ({ onDetected, onClose }) => {
  const scannerRef = useRef(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isCameraAccessDenied, setIsCameraAccessDenied] = useState(false);
  
  useEffect(() => {
    // Initialize the barcode scanner when component mounts
    initBarcodeScanner();
    
    // Clean up when the component unmounts
    return () => {
      if (isInitialized) {
        Quagga.stop();
      }
    };
  }, []);
  
  const initBarcodeScanner = () => {
    if (!scannerRef.current) {
      return;
    }
    
    setErrorMessage('');
    
    Quagga.init({
      inputStream: {
        name: "Live",
        type: "LiveStream",
        target: scannerRef.current,
        constraints: {
          width: 480,
          height: 320,
          facingMode: "environment" // Use the rear camera if available
        },
      },
      decoder: {
        readers: [
          "ean_reader",
          "ean_8_reader",
          "upc_reader",
          "upc_e_reader",
          "code_128_reader",
          "code_39_reader",
          "code_39_vin_reader",
          "codabar_reader",
          "i2of5_reader",
          "2of5_reader",
          "code_93_reader"
        ]
      },
      locate: true
    }, function(err) {
      if (err) {
        console.error("Error initializing Quagga:", err);
        if (err.name === 'NotAllowedError') {
          setIsCameraAccessDenied(true);
          setErrorMessage('Camera access was denied. Please allow camera access to scan barcodes.');
        } else {
          setErrorMessage('Failed to initialize barcode scanner. Please try again.');
        }
        return;
      }
      
      setIsInitialized(true);
      Quagga.start();
    });
    
    // Register callback for successful scans
    Quagga.onDetected((result) => {
      if (result && result.codeResult && result.codeResult.code) {
        const barcode = result.codeResult.code;
        console.log("Barcode detected:", barcode);
        
        // Stop scanning after a successful detection
        Quagga.stop();
        setIsInitialized(false);
        
        // Call the onDetected callback with the barcode
        if (onDetected) {
          onDetected(barcode);
        }
      }
    });
  };
  
  // Restart the scanner (e.g., if there was an error or user wants to try again)
  const restartScanner = () => {
    if (isInitialized) {
      Quagga.stop();
      setIsInitialized(false);
    }
    
    setTimeout(() => {
      initBarcodeScanner();
    }, 100);
  };
  
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-md">
        {/* Close button */}
        <button
          className="absolute top-2 right-2 z-10 text-white bg-black/30 rounded-full p-1 hover:bg-black/50 transition-colors"
          onClick={onClose}
        >
          <XCircle size={24} />
        </button>
        
        {/* Scanner viewport */}
        <div 
          ref={scannerRef} 
          className="overflow-hidden rounded-lg border-2 border-teal-500 bg-black relative"
          style={{ minHeight: '300px' }}
        >
          {!isInitialized && !errorMessage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-white">
              <Camera size={48} className="mb-2 animate-pulse" />
              <p>Initializing camera...</p>
            </div>
          )}
          
          {errorMessage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white p-4 text-center">
              <p className="mb-4">{errorMessage}</p>
              {!isCameraAccessDenied && (
                <button
                  onClick={restartScanner}
                  className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors"
                >
                  Try Again
                </button>
              )}
            </div>
          )}
          
          {/* Scanner guide lines */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="w-full h-full border-4 border-dashed border-white/30 flex flex-col items-center justify-center">
              <div className="w-2/3 h-16 border-2 border-teal-400"></div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="mt-4 text-center text-gray-600">
        <p>Point your camera at a barcode to scan</p>
        <p className="text-sm mt-1">Make sure the barcode is well-lit and centered</p>
      </div>
    </div>
  );
};

export default BarcodeScanner;