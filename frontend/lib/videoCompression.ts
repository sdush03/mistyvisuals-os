export async function compressVideoFile(file: File): Promise<{ blob: Blob, objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    // Ensure the source video is technically 'unmuted' so we can capture its audio stream, 
    // but keep volume at 0 if we don't want to hear it while compressing.
    video.muted = false;
    video.volume = 1.0; 
    video.autoplay = true;
    video.playsInline = true;
    
    // Create object URL for the raw file
    const rawUrl = URL.createObjectURL(file);
    video.src = rawUrl;
    
    video.onloadedmetadata = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas ctx failed.'));

      // Downscale aggressively to 720p max
      let w = video.videoWidth;
      let h = video.videoHeight;
      const MAX = 1280;
      if (w > h) {
        if (w > MAX) {
          h *= MAX / w;
          w = MAX;
        }
      } else {
        if (h > MAX) {
          w *= MAX / h;
          h = MAX;
        }
      }
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);

      const canvasStream = canvas.captureStream(30); // 30fps visual
      
      // Get the audio track from the original video
      const videoStream = (video as any).captureStream ? (video as any).captureStream() : (video as any).mozCaptureStream ? (video as any).mozCaptureStream() : null;
      if (videoStream && videoStream.getAudioTracks().length > 0) {
        canvasStream.addTrack(videoStream.getAudioTracks()[0]);
      }

      let mimeType = 'video/webm;codecs=vp9,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm;codecs=vp8,opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

      const recorder = new MediaRecorder(canvasStream, { 
         mimeType, 
         videoBitsPerSecond: 2500000 // Slightly higher bitrate for better audio/video mix
      });
      
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); }
      
      recorder.onstop = () => {
         const compressedBlob = new Blob(chunks, { type: mimeType });
         resolve({ 
            blob: compressedBlob, 
            objectUrl: URL.createObjectURL(compressedBlob) 
         });
         URL.revokeObjectURL(rawUrl);
      };

      video.onplay = () => {
         recorder.start();
         const draw = () => {
            if (video.paused || video.ended) return;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            requestAnimationFrame(draw);
         };
         draw();
         
      };

      video.onended = () => {
         if (recorder.state === 'recording') recorder.stop();
      };
      
      video.play().catch(reject);
    };
    
    video.onerror = reject;
  });
}
