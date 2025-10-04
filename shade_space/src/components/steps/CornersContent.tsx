import React from 'react';
import { ConfiguratorState } from '../../types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const Triangle = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M13.73 4a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
  </svg>
);

const Square = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="3" y="3" width="18" height="18" rx="2"/>
  </svg>
);

const Pentagon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2l8 6v9l-8 5-8-5V8z"/>
  </svg>
);

const Hexagon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
  </svg>
);

interface CornersContentProps {
  config: ConfiguratorState;
  updateConfig: (updates: Partial<ConfiguratorState>) => void;
  validationErrors?: {[key: string]: string};
  onNext: () => void;
  onPrev: () => void;
  nextStepTitle?: string;
  showBackButton?: boolean;
}

const SHAPE_OPTIONS = [
  { corners: 3, label: '3 Fixing Points', icon: Triangle, description: 'Classic triangular shade' },
  { corners: 4, label: '4 Fixing Points', icon: Square, description: 'Most popular choice' },
  { corners: 5, label: '5 Fixing Points', icon: Pentagon, description: 'Unique five-sided design' },
  { corners: 6, label: '6 Fixing Points', icon: Hexagon, description: 'Modern hexagonal shape' }
];

export function CornersContent({ config, updateConfig, onNext, onPrev, nextStepTitle = '', showBackButton = false, validationErrors = {} }: CornersContentProps) {
  const generateRegularPoints = (corners: number) => {
    const centerX = 300;
    const centerY = 300;
    const radius = 200;
    const points = [];
    
    // Start with A in top-left, work clockwise
    // For all shapes, start at top-left (-135 degrees)
    const startAngle = -3 * Math.PI / 4; // -135 degrees = top-left
    
    for (let i = 0; i < corners; i++) {
      // Go clockwise (positive angle increment)
      const angle = startAngle + (i * 2 * Math.PI) / corners;
      points.push({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      });
    }
    
    return points;
  };

  const handleShapeChange = (corners: number) => {
    const points = generateRegularPoints(corners);
    const newHeights = Array(corners).fill(0);
    const newTypes = Array(corners).fill('');
    const newOrientations = Array(corners).fill('');
    
    updateConfig({
      corners,
      points,
      measurements: {}, // Reset measurements when corners change
      fixingHeights: newHeights,
      fixingTypes: newTypes,
      eyeOrientations: newOrientations
    });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-slate-900 mb-4">
          How many fixing points will your shade sail have?
        </h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {SHAPE_OPTIONS.map((shape) => {
            const Icon = shape.icon;
            const hasError = validationErrors.corners && !config.corners;
            
            return (
              <Card
                key={shape.corners}
                className={`p-4 cursor-pointer transition-all duration-200 hover:shadow-lg ${
                  config.corners === shape.corners
                   ? '!ring-2 !ring-[#01312D] !border-2 !border-[#01312D]'
                   : hasError
                   ? 'border-2 !border-red-500 bg-red-50 hover:!border-red-600'
                   : 'hover:border-slate-300'
                }`}
                onClick={() => handleShapeChange(shape.corners)}
              >
                <div className="text-center">
                  <Icon className="w-10 h-10 mx-auto mb-2 text-[#0e302d]" />
                  <h5 className="font-semibold text-slate-900 mb-1">
                    {shape.label}
                  </h5>
                  <p className="text-xs text-slate-600">
                    {shape.description}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-4 pt-4 border-t border-slate-200">
        <div className="flex flex-col sm:flex-row gap-4">
          {showBackButton && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={onPrev}
              className="sm:w-auto"
            >
              Back
            </Button>
          )}
          <Button 
            onClick={onNext} 
            size="md"
            className={`flex-1 ${!config.corners ? 'opacity-50' : ''}`}
          >
            Continue to {nextStepTitle}
          </Button>
        </div>
      </div>
    </div>
  );
}