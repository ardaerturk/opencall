import React, { useCallback, useEffect, useRef, useState, memo, CSSProperties } from 'react';
import { useResizeObserver } from '../../hooks/useResizeObserver';
import { throttle } from '../../utils/performance';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number | ((item: T, index: number) => number);
  renderItem: (item: T, index: number, style: CSSProperties) => React.ReactNode;
  overscan?: number;
  className?: string;
  onScroll?: (scrollTop: number) => void;
  scrollToIndex?: number;
  getItemKey?: (item: T, index: number) => string | number;
  estimatedItemHeight?: number;
  threshold?: number;
  onEndReached?: () => void;
}

interface ItemPosition {
  index: number;
  offset: number;
  height: number;
}

const VirtualList = <T,>({
  items,
  itemHeight,
  renderItem,
  overscan = 3,
  className = '',
  onScroll,
  scrollToIndex,
  getItemKey,
  estimatedItemHeight = 50,
  threshold = 5,
  onEndReached
}: VirtualListProps<T>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const itemPositions = useRef<ItemPosition[]>([]);
  const measurementCache = useRef<Map<number, number>>(new Map());

  // Use resize observer to track container size changes
  useResizeObserver(containerRef, (entry) => {
    setContainerHeight(entry.contentRect.height);
  });

  // Calculate item positions
  const calculateItemPositions = useCallback(() => {
    const positions: ItemPosition[] = [];
    let offset = 0;

    for (let i = 0; i < items.length; i++) {
      const height = typeof itemHeight === 'function' 
        ? (measurementCache.current.get(i) || itemHeight(items[i], i) || estimatedItemHeight)
        : itemHeight;

      positions.push({
        index: i,
        offset,
        height
      });

      offset += height;
    }

    itemPositions.current = positions;
    return positions;
  }, [items, itemHeight, estimatedItemHeight]);

  const positions = calculateItemPositions();
  const totalHeight = positions[positions.length - 1]?.offset + positions[positions.length - 1]?.height || 0;

  // Find visible range
  const findStartIndex = (scrollTop: number): number => {
    let low = 0;
    let high = positions.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const midOffset = positions[mid].offset;

      if (midOffset === scrollTop) {
        return mid;
      } else if (midOffset < scrollTop) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return Math.max(0, high);
  };

  const startIndex = Math.max(0, findStartIndex(scrollTop) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    findStartIndex(scrollTop + containerHeight) + overscan
  );

  // Handle scroll
  const handleScroll = useCallback(
    throttle((e: React.UIEvent<HTMLDivElement>) => {
      const newScrollTop = e.currentTarget.scrollTop;
      setScrollTop(newScrollTop);
      onScroll?.(newScrollTop);

      // Check if end reached
      if (onEndReached && items.length > 0) {
        const scrollBottom = newScrollTop + containerHeight;
        const endThreshold = totalHeight - (threshold * estimatedItemHeight);
        
        if (scrollBottom >= endThreshold) {
          onEndReached();
        }
      }
    }, 16), // ~60fps
    [containerHeight, onScroll, onEndReached, items.length, totalHeight, threshold, estimatedItemHeight]
  );

  // Scroll to index
  useEffect(() => {
    if (scrollToIndex !== undefined && scrollRef.current && positions[scrollToIndex]) {
      const targetPosition = positions[scrollToIndex];
      scrollRef.current.scrollTop = targetPosition.offset;
    }
  }, [scrollToIndex, positions]);

  // Measure item heights for dynamic sizing
  const measureItem = useCallback((index: number, element: HTMLElement | null) => {
    if (!element || typeof itemHeight !== 'function') return;

    const height = element.getBoundingClientRect().height;
    const cachedHeight = measurementCache.current.get(index);
    
    if (cachedHeight !== height) {
      measurementCache.current.set(index, height);
      // Force recalculation on next render
      calculateItemPositions();
    }
  }, [itemHeight, calculateItemPositions]);

  // Render visible items
  const visibleItems = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const item = items[i];
    const position = positions[i];
    if (!item || !position) continue;

    const key = getItemKey ? getItemKey(item, i) : i;
    const style: CSSProperties = {
      position: 'absolute',
      top: position.offset,
      left: 0,
      right: 0,
      height: position.height
    };

    visibleItems.push(
      <div
        key={key}
        ref={(el) => measureItem(i, el)}
        style={style}
      >
        {renderItem(item, i, style)}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`virtual-list-container ${className}`}
      style={{ position: 'relative', height: '100%', width: '100%' }}
    >
      <div
        ref={scrollRef}
        className="virtual-list-scroll"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'auto'
        }}
        onScroll={handleScroll}
      >
        <div
          className="virtual-list-content"
          style={{
            position: 'relative',
            height: totalHeight,
            width: '100%'
          }}
        >
          {visibleItems}
        </div>
      </div>
    </div>
  );
};

export default memo(VirtualList) as typeof VirtualList;

// Specialized virtual list for participants
export const ParticipantVirtualList = memo(({ 
  participants,
  renderParticipant,
  className
}: {
  participants: any[];
  renderParticipant: (participant: any, index: number) => React.ReactNode;
  className?: string;
}) => {
  const itemHeight = 80; // Fixed height for participants
  
  const renderItem = useCallback((participant: any, index: number, style: CSSProperties) => {
    return renderParticipant(participant, index);
  }, [renderParticipant]);

  const getItemKey = useCallback((participant: any) => participant.id, []);

  return (
    <VirtualList
      items={participants}
      itemHeight={itemHeight}
      renderItem={renderItem}
      getItemKey={getItemKey}
      className={className}
      overscan={5}
    />
  );
});

ParticipantVirtualList.displayName = 'ParticipantVirtualList';