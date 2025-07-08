import { useState, useEffect } from 'react';

interface Breakpoints {
  mobile: boolean;
  tablet: boolean;
  desktop: boolean;
  isSmallScreen: boolean;
  isMediumScreen: boolean;
  isLargeScreen: boolean;
}

const BREAKPOINTS = {
  mobile: 640,
  tablet: 768,
  desktop: 1024,
};

export function useResponsive(): Breakpoints {
  const [breakpoints, setBreakpoints] = useState<Breakpoints>(() => {
    if (typeof window === 'undefined') {
      return {
        mobile: false,
        tablet: false,
        desktop: true,
        isSmallScreen: false,
        isMediumScreen: false,
        isLargeScreen: true,
      };
    }

    const width = window.innerWidth;
    return {
      mobile: width < BREAKPOINTS.mobile,
      tablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet,
      desktop: width >= BREAKPOINTS.desktop,
      isSmallScreen: width < BREAKPOINTS.tablet,
      isMediumScreen: width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop,
      isLargeScreen: width >= BREAKPOINTS.desktop,
    };
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setBreakpoints({
        mobile: width < BREAKPOINTS.mobile,
        tablet: width >= BREAKPOINTS.mobile && width < BREAKPOINTS.tablet,
        desktop: width >= BREAKPOINTS.desktop,
        isSmallScreen: width < BREAKPOINTS.tablet,
        isMediumScreen: width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop,
        isLargeScreen: width >= BREAKPOINTS.desktop,
      });
    };

    // Use ResizeObserver for better performance
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(document.body);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return breakpoints;
}