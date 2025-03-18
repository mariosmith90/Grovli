"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Camera, XCircle } from 'lucide-react';
import 'barcode-detector';

const WebBarcodeScanner = ({ onDetected, onClose }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    let barcodeDetector;
    let stream;

    const initScanner = async () => {
      // Check if BarcodeDetector is available
      if (!('BarcodeDetector' in window)) {
        console.error('Barcode Detector is not supported in this browser');
        onClose();
        return;
      }

      try {
        // Create BarcodeDetector instance
        barcodeDetector = new BarcodeDetector({
          formats: [
            'ean_13', 'ean_8', 
            'upc_a', 'upc_e', 
            'code_128', 'code_39', 'code_93', 
            'qr_code', 'data_matrix', 'aztec'
          ]
        });

        // Access camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 }
          }
        });

        // Ensure video ref exists before setting up
        if (!videoRef.current) {
          console.error('Video ref is not available');
          onClose();
          return;
        }

        // Set up video element
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        
        // Wait for metadata to load
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = resolve;
        });

        // Play video
        await videoRef.current.play();

        setIsScanning(true);

        // Start continuous scanning
        const scanBarcode = async () => {
          // Check if refs are still valid
          if (!videoRef.current || !canvasRef.current) {
            console.error('Video or canvas ref is no longer available');
            return;
          }

          const video = videoRef.current;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');

          // Ensure video is ready
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            // Set canvas dimensions to match video
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            // Draw current video frame to canvas
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            try {
              // Detect barcodes
              const barcodes = await barcodeDetector.detect(canvas);

              if (barcodes.length > 0) {
                // Stop scanning and call detection callback
                stream.getTracks().forEach(track => track.stop());
                onDetected(barcodes[0].rawValue);
                return;
              }
            } catch (error) {
              console.error('Barcode detection error:', error);
            }
          }

          // Continue scanning if no barcode found
          requestAnimationFrame(scanBarcode);
        };

        // Start scanning 
        requestAnimationFrame(scanBarcode);

      } catch (error) {
        console.error('Error initializing barcode scanner:', error);
        onClose();
      }
    };

    // Initialize scanner
    initScanner();

    // Cleanup function
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [onDetected, onClose]);

  return (
    <div className="relative w-full max-w-md mx-auto bg-black rounded-lg overflow-hidden shadow-lg">
      {/* Close button */}
      <button
        className="absolute top-2 right-2 z-10 text-white bg-black/30 rounded-full p-2 hover:bg-black/50 transition-colors"
        onClick={onClose}
      >
        <XCircle size={24} />
      </button>
      
      {/* Scanner viewport */}
      <div className="relative w-full aspect-video">
        {/* Video element */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
        />

        {/* Hidden canvas for processing */}
        <canvas
          ref={canvasRef}
          className="hidden"
        />
        
        {/* Loading state */}
        {!isScanning && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white">
            <Camera size={48} className="mb-2 animate-pulse" />
            <p>Initializing scanner...</p>
          </div>
        )}
      </div>
      
      {/* Instructions */}
      <div className="p-4 text-center text-white bg-black/30">
        <p>Point your camera at a barcode to scan</p>
        <p className="text-sm mt-1">Make sure the barcode is well-lit and centered</p>
      </div>
    </div>
  );
};

export default WebBarcodeScanner;