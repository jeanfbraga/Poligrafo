"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface HybridTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
}

export function HybridTooltip({ content, children }: HybridTooltipProps) {
  const [show, setShow] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, transform: "translateX(-50%)" });

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let newLeft = rect.left + rect.width / 2;
      let newTransform = "translateX(-50%)";
      const margin = 16;
      
      // Assumindo max-width 200px do tooltip, a metade é 100px
      if (newLeft < 100 + margin) {
        newLeft = margin; // Gruda na esquerda com margem
        newTransform = "translateX(0)";
      } else if (newLeft > window.innerWidth - 100 - margin) {
        newLeft = window.innerWidth - margin; // Gruda na direita com margem
        newTransform = "translateX(-100%)";
      }

      setCoords({
        top: rect.top - 8, // 8px above the badge
        left: newLeft,
        transform: newTransform
      });
    }
  };

  useEffect(() => {
    if (show) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [show]);

  // Fecha o tooltip se clicar fora
  useEffect(() => {
    if (!show) return;
    const handleOutsideClick = () => setShow(false);
    
    const timeoutId = setTimeout(() => {
      document.addEventListener("touchstart", handleOutsideClick);
      document.addEventListener("click", handleOutsideClick);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("touchstart", handleOutsideClick);
      document.removeEventListener("click", handleOutsideClick);
    };
  }, [show]);

  return (
    <>
      <div 
        ref={triggerRef}
        className="inline-block cursor-help relative"
        onPointerEnter={(e) => {
          // Apenas reage ao hover se for mouse genuíno. Evita conflitos no touch.
          if (e.pointerType === "mouse") setShow(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setShow(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setShow((prev) => !prev);
        }}
      >
        {children}
      </div>
      
      {show && typeof document !== "undefined" && createPortal(
        <div 
          className="fixed z-[99999] bg-black border border-green-900 text-green-400 text-xs px-3 py-2 shadow-lg max-w-[200px] text-center pointer-events-none"
          style={{ 
            top: coords.top, 
            left: coords.left,
            transform: `translateY(-100%) ${coords.transform}`
          }}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  );
}
