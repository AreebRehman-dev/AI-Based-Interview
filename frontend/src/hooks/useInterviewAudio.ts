import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Custom hook for managing audio recording and playback during interviews
 * 
 * Features:
 * - Recording audio from microphone
 * - Playing AI-generated audio responses
 * - Managing recording/playback state
 * - Proper cleanup on unmount
 */
export const useInterviewAudio = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [audioPermission, setAudioPermission] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  /**
   * Release the Blob URL backing the last played clip.
   * Object URLs pin their blob in memory until revoked, so every clip we
   * create has to be released once playback is over.
   */
  const revokeObjectUrl = useCallback((): void => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  /**
   * Tear down an audio element and abort whatever it is still downloading.
   *
   * Pausing alone is not enough for a streamed source: the browser keeps
   * pulling the rest of the clip in the background, which means the speech
   * service carries on synthesizing audio nobody will hear. Dropping the src
   * and reloading cancels the request outright.
   */
  const releaseAudioElement = useCallback((audio: HTMLAudioElement | null): void => {
    if (!audio) return;

    // Detach handlers first so aborting the load does not fire onerror
    audio.onplay = null;
    audio.onended = null;
    audio.onerror = null;
    audio.onpause = null;

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }, []);

  /**
   * Start recording audio from the user's microphone
   * Requests permission if not already granted
   */
  const startRecording = useCallback(async (): Promise<void> => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setAudioPermission(true);

      // Initialize MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') 
          ? 'audio/webm' 
          : 'audio/mp4'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Handle incoming audio data
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle errors during recording
      mediaRecorder.onerror = (event: Event) => {
        console.error("MediaRecorder error:", event);
        setIsRecording(false);
      };

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);

    } catch (error) {
      console.error("Error accessing microphone:", error);
      setAudioPermission(false);
      
      // Provide user-friendly error messages
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          throw new Error("Microphone access denied. Please allow microphone permissions.");
        } else if (error.name === 'NotFoundError') {
          throw new Error("No microphone found. Please connect a microphone.");
        }
      }
      throw new Error("Failed to access microphone. Please check your settings.");
    }
  }, []);

  /**
   * Stop recording and return the recorded audio as a Blob
   * Returns a Promise that resolves with the audio Blob, or null if not recording
   * 
   * @returns Promise<Blob | null> - Audio blob or null if no active recording
   */
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;

      const stopMediaStreams = () => {
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => {
            track.stop();
            console.log('Stopped media track:', track.kind);
          });
          mediaStreamRef.current = null;
        }
        setIsRecording(false);
      };

      // If not recording, just clean up streams and return null
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        console.warn("stopRecording called but no active recording found");
        stopMediaStreams();
        resolve(null);
        return;
      }

      // Set up the stop handler
      mediaRecorder.onstop = () => {
        try {
          // Create blob from recorded chunks
          const audioBlob = new Blob(audioChunksRef.current, { 
            type: 'audio/wav' 
          });

          // Clean up
          audioChunksRef.current = [];
          stopMediaStreams();

          resolve(audioBlob);
        } catch (error) {
          console.error("Error creating audio blob:", error);
          stopMediaStreams();
          resolve(null);
        }
      };

      // Stop the recorder
      try {
        mediaRecorder.stop();
        setIsRecording(false);
      } catch (error) {
        console.error("Error stopping recorder:", error);
        stopMediaStreams();
        resolve(null);
      }
    });
  }, []);

  /**
   * Play audio from a base64 encoded string
   * Stops any currently playing audio before playing new audio
   * 
   * @param base64String - Base64 encoded audio data
   */
  const playAudio = useCallback((base64String: string, mimeType = "audio/mpeg"): void => {
    try {
      // Stop whatever was playing, cancelling its download if still streaming
      releaseAudioElement(audioPlayerRef.current);
      audioPlayerRef.current = null;
      revokeObjectUrl();

      // Decode to a Blob URL rather than handing the element a data: URI.
      // The browser has to parse a data: URI in full before it can start
      // playing; a Blob URL points at bytes that are already decoded.
      const binary = atob(base64String);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      objectUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
      audioPlayerRef.current = audio;

      // Set up event handlers
      audio.onplay = () => {
        setIsAudioPlaying(true);
      };

      audio.onended = () => {
        setIsAudioPlaying(false);
        audioPlayerRef.current = null;
        revokeObjectUrl();
      };

      audio.onerror = (error) => {
        console.error("Error playing audio:", error);
        setIsAudioPlaying(false);
        audioPlayerRef.current = null;
        revokeObjectUrl();
      };

      audio.onpause = () => {
        setIsAudioPlaying(false);
      };

      // Play the audio
      audio.play().catch((error) => {
        console.error("Failed to play audio:", error);
        setIsAudioPlaying(false);
        audioPlayerRef.current = null;
        revokeObjectUrl();
      });

    } catch (error) {
      console.error("Error setting up audio playback:", error);
      setIsAudioPlaying(false);
      revokeObjectUrl();
    }
  }, [releaseAudioElement, revokeObjectUrl]);

  /**
   * Play audio straight from a streaming URL.
   *
   * The <audio> element starts on the first chunk that arrives rather than
   * waiting for the file to finish, so playback begins as soon as the speech
   * service emits its first bytes instead of after the whole clip is built.
   *
   * @param url - Endpoint streaming audio (chunked audio/mpeg)
   */
  const playStream = useCallback((url: string): void => {
    try {
      // Stop whatever was playing, cancelling its download if still streaming
      releaseAudioElement(audioPlayerRef.current);
      audioPlayerRef.current = null;
      revokeObjectUrl();

      const audio = new Audio();
      audio.preload = "auto";
      audio.src = url;
      audioPlayerRef.current = audio;

      // Mark the turn as speaking straight away rather than waiting for onplay.
      // Audio now arrives a beat after the text does, and without this the mic
      // would re-enable during that gap and let the user talk over the reply.
      setIsAudioPlaying(true);

      audio.onplay = () => {
        setIsAudioPlaying(true);
      };

      audio.onended = () => {
        setIsAudioPlaying(false);
        audioPlayerRef.current = null;
      };

      audio.onerror = () => {
        console.error("Error streaming audio:", audio.error);
        setIsAudioPlaying(false);
        audioPlayerRef.current = null;
      };

      audio.onpause = () => {
        setIsAudioPlaying(false);
      };

      audio.play().catch((error) => {
        console.error("Failed to play streamed audio:", error);
        setIsAudioPlaying(false);
        audioPlayerRef.current = null;
      });
    } catch (error) {
      console.error("Error setting up audio stream:", error);
      setIsAudioPlaying(false);
    }
  }, [releaseAudioElement, revokeObjectUrl]);

  /**
   * Stop/interrupt currently playing audio immediately
   * Useful for allowing users to interrupt AI responses
   * 
   * - Pauses audio immediately
   * - Resets playback position to start
   * - Updates state to reflect audio stopped
   */
  const stopAudio = useCallback((): void => {
    if (audioPlayerRef.current) {
      // Aborts playback and any in-flight stream behind it
      releaseAudioElement(audioPlayerRef.current);
      audioPlayerRef.current = null;
    }

    revokeObjectUrl();

    // Always set state to false when stopping
    setIsAudioPlaying(false);
  }, [releaseAudioElement, revokeObjectUrl]);

  /**
   * Toggle between recording and not recording
   * Returns a Promise that resolves with the audio Blob when stopping
   */
  const toggleRecording = useCallback(async (): Promise<Blob | null> => {
    if (isRecording) {
      return await stopRecording();
    } else {
      await startRecording();
      return null;
    }
  }, [isRecording, startRecording, stopRecording]);

  /**
   * Cleanup function - stops all audio/recording on unmount
   */
  useEffect(() => {
    return () => {
      // Stop any active recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      // Stop all media stream tracks
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }

      // Stop any playing audio and cancel an in-flight stream
      const audio = audioPlayerRef.current;
      if (audio) {
        audio.onplay = null;
        audio.onended = null;
        audio.onerror = null;
        audio.onpause = null;
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        audioPlayerRef.current = null;
      }

      // Release the last Blob URL
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  return {
    // State
    isRecording,
    isAudioPlaying,
    audioPermission,

    // Functions
    startRecording,
    stopRecording,
    playAudio,
    playStream,
    stopAudio,
    toggleRecording,
  };
};
