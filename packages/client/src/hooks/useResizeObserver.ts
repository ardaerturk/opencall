import { useEffect, useRef, RefObject } from 'react';

type ResizeObserverCallback = (entry: ResizeObserverEntry) => void;

export function useResizeObserver(
  ref: RefObject<Element>,
  callback: ResizeObserverCallback
): void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!ref.current || typeof window === 'undefined' || !window.ResizeObserver) {
      return;
    }

    const element = ref.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        callbackRef.current(entry);
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [ref]);
}