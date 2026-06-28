import React, { useRef } from 'react';
import { BaseEdge, getSmoothStepPath, EdgeProps, EdgeLabelRenderer } from '@xyflow/react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export default function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  label
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const pathRef = useRef<SVGPathElement>(null);

  useGSAP(() => {
    if (pathRef.current) {
      const length = pathRef.current.getTotalLength();
      
      // Inicia "apagado" com dasharray igual ao tamanho total
      gsap.set(pathRef.current, {
        strokeDasharray: length,
        strokeDashoffset: length,
      });

      // Anima "desenhando" a linha
      gsap.to(pathRef.current, {
        strokeDashoffset: 0,
        duration: 1.5,
        ease: "power2.out",
      });
    }
  }, { scope: pathRef, dependencies: [edgePath] });

  return (
    <>
      <BaseEdge 
        id={id} 
        path={edgePath} 
        markerEnd={markerEnd} 
        style={{ ...style, fill: 'none' }} 
      />
      {/* Path sobreposto invisível/visível que recebe a animação via GSAP */}
      <path
        ref={pathRef}
        id={`${id}-animated`}
        style={{ ...style, fill: 'none' }}
        className="react-flow__edge-path"
        d={edgePath}
        markerEnd={markerEnd}
      />
      
      {/* Se houver label, exibe perfeitamente centralizado usando EdgeLabelRenderer (HTML layer) */}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: '#0f172a',
              color: '#f8fafc',
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid #334155',
              fontSize: '11px',
              fontWeight: 600,
              // Mantém legível mesmo que outras linhas passem atrás
              zIndex: 10, 
            }}
            className="nodrag nopan"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
