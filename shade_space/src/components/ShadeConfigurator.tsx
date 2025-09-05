import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { PriceSummaryDisplay } from './PriceSummaryDisplay';
import { AccordionStep } from './AccordionStep';
import { FabricSelectionContent } from './steps/FabricSelectionContent';
import { EdgeTypeContent } from './steps/EdgeTypeContent';
import { CornersContent } from './steps/CornersContent';
import { CombinedMeasurementContent } from './steps/CombinedMeasurementContent';
import { DimensionsContent } from './steps/DimensionsContent';
import { FixingPointsContent } from './steps/FixingPointsContent';
import { ReviewContent } from './steps/ReviewContent';
import { useShadeCalculations } from '../hooks/useShadeCalculations';
import { ConfiguratorState, FabricType, EdgeType } from '../types';
import { FABRICS } from '../data/fabrics';
import { Point } from '../types';
import { validateMeasurements, validateHeights, getDiagonalKeysForCorners } from '../utils/geometry';
import { generatePDF } from '../utils/pdfGenerator';
import { ShapeCanvas } from './ShapeCanvas';
import { EXCHANGE_RATES } from '../data/pricing'; // Import EXCHANGE_RATES to check supported currencies

const INITIAL_STATE: ConfiguratorState = {
  step: 0,
  fabricType: 'monotec370' as FabricType,
  fabricColor: 'Koonunga Green',
  edgeType: '' as EdgeType,
  corners: 0,
  unit: '' as 'metric' | 'imperial',
  measurementOption: '' as 'adjust' | 'exact',
  points: [
    { x: 100, y: 150 },
    { x: 500, y: 150 },
    { x: 500, y: 450 },
    { x: 100, y: 450 }
  ],
  measurements: {},
  fixingHeights: [],
  fixingTypes: undefined,
  eyeOrientations: undefined,
  currency: 'NZD'
};

console.log('🚀 ShadeConfigurator component is loading - this should appear in console');

export function ShadeConfigurator() {
  const [config, setConfig] = useState<ConfiguratorState>(INITIAL_STATE);
  const [openStep, setOpenStep] = useState<number>(0);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [typoSuggestions, setTypoSuggestions] = useState<{ [key: string]: number }>({});
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const reviewContentRef = useRef<HTMLDivElement>(null);

  // Pricing and order state (lifted from ReviewContent)
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [email, setEmail] = useState('');
  const [acknowledgments, setAcknowledgments] = useState({
    customManufactured: false,
    measurementsAccurate: false,
    installationNotIncluded: false,
    structuralResponsibility: false
  });

  // Highlighted measurement state for sticky diagram
  const [highlightedMeasurement, setHighlightedMeasurement] = useState<string | null>(null);

  // Canvas ref for PDF generation
  const canvasRef = useRef<any>(null);

  const calculations = useShadeCalculations(config);

  // Mobile detection effect
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    // Initial check
    checkIsMobile();

    // Add event listener for window resize
    window.addEventListener('resize', checkIsMobile);

    // Cleanup function to remove event listener
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);

  /*
  // IP-based currency detection effect
  // useEffect(() => {
  //   const detectCurrency = async () => {
  //     try {
  //       const response = await fetch('https://ipapi.co/json/');
  //       const data = await response.json();
  //       console.log('Full ipapi.co response:', data);
  //       
  //       if (data.currency) {
  //         const detectedCurrency = data.currency;
  //         console.log('EXCHANGE_RATES object:', EXCHANGE_RATES);
  //         console.log('EXCHANGE_RATES[detectedCurrency]:', EXCHANGE_RATES[detectedCurrency]);
  //         console.log('Boolean check EXCHANGE_RATES[detectedCurrency]:', !!EXCHANGE_RATES[detectedCurrency]);
  //         
  //         if (EXCHANGE_RATES[detectedCurrency]) {
  //           updateConfig({ currency: detectedCurrency });
  //         } else {
  //           console.warn(`❌ Detected currency ${detectedCurrency} is not supported in EXCHANGE_RATES.`);
  //           console.warn('Available currencies in EXCHANGE_RATES:', Object.keys(EXCHANGE_RATES));
  //           updateConfig({ currency: 'USD' }); // Fallback to USD
  //         }
  //       } else {
  //         console.warn('❌ No currency field in ipapi.co response');
  //         updateConfig({ currency: 'USD' }); // Fallback to USD
  //       }
  //     } catch (error) {
  //       updateConfig({ currency: 'USD' }); // Fallback to USD on network error
  //     }
  //   };
  //
  //   detectCurrency();
  // }, []); // Empty dependency array ensures this runs only once on mount
  */

  const updateConfig = (updates: Partial<ConfiguratorState>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  };

  const selectedFabric = FABRICS.find(f => f.id === config.fabricType);

  // Pricing and order handlers (lifted from ReviewContent)
  const handleGeneratePDF = async (svgElement?: SVGElement) => {
    setIsGeneratingPDF(true);
    try {
      await generatePDF(config, calculations, reviewContentRef.current || undefined, svgElement);
    } catch (error) {
      console.error('Error generating PDF:', error);

      // More user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to generate PDF: ${errorMessage}\n\nPlease try again. If the problem persists, please contact support.`);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Enhanced PDF generation with SVG element
  const handleGeneratePDFWithSVG = async () => {
    const svgElement = canvasRef.current?.getSVGElement?.();
    await handleGeneratePDF(svgElement);
  };

  const handleEmailSummary = () => {
    if (!showEmailInput) {
      setShowEmailInput(true);
    } else if (email.trim()) {
      // TODO: Implement actual email sending functionality
      alert(`Email summary will be sent to: ${email}`);
      setShowEmailInput(false);
      setEmail('');
    } else {
      // Cancel action
      setShowEmailInput(false);
      setEmail('');
    }
  };

  const handleCancelEmailInput = () => {
    setShowEmailInput(false);
    setEmail('');
  };

  const handleAcknowledgmentChange = (key: keyof typeof acknowledgments) => {
    setAcknowledgments(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Calculate derived state for order process
  const getDiagonalMeasurements = useMemo(() => {
    const diagonals = [];

    if (config.corners === 4) {
      diagonals.push(
        { key: 'AC', hasValue: !!config.measurements['AC'] },
        { key: 'BD', hasValue: !!config.measurements['BD'] }
      );
    } else if (config.corners === 5) {
      diagonals.push(
        { key: 'AC', hasValue: !!config.measurements['AC'] },
        { key: 'AD', hasValue: !!config.measurements['AD'] },
        { key: 'AE', hasValue: !!config.measurements['AE'] },
        { key: 'BD', hasValue: !!config.measurements['BD'] },
        { key: 'BE', hasValue: !!config.measurements['BE'] }
      );
    } else if (config.corners === 6) {
      diagonals.push(
        { key: 'AC', hasValue: !!config.measurements['AC'] },
        { key: 'AD', hasValue: !!config.measurements['AD'] },
        { key: 'AE', hasValue: !!config.measurements['AE'] },
        { key: 'BD', hasValue: !!config.measurements['BD'] },
        { key: 'BE', hasValue: !!config.measurements['BE'] },
        { key: 'BF', hasValue: !!config.measurements['BF'] },
        { key: 'CE', hasValue: !!config.measurements['CE'] },
        { key: 'CF', hasValue: !!config.measurements['CF'] },
        { key: 'DF', hasValue: !!config.measurements['DF'] }
      );
    }

    return diagonals;
  }, [config.corners, config.measurements]);

  const diagonalMeasurements = getDiagonalMeasurements;

  const allDiagonalsEntered = useMemo(() => {
    // If diagonals were initially provided in the Dimensions step, consider them as entered
    if (config.diagonalsInitiallyProvided) {
      return true;
    }

    // For corners that require diagonals, check if all required diagonal measurements are present
    if (config.corners >= 4) {
      const requiredDiagonals = getDiagonalKeysForCorners(config.corners);
      return requiredDiagonals.every(key =>
        config.measurements[key] && config.measurements[key] > 0
      );
    }

    // For 3 corners, no diagonals are required
    return true;
  }, [config.diagonalsInitiallyProvided, config.corners, config.measurements]);

  const allAcknowledgmentsChecked = Object.values(acknowledgments).every(checked => checked);
  const canAddToCart = allDiagonalsEntered && allAcknowledgmentsChecked;

  // Calculate if all edge measurements are complete
  const hasAllEdgeMeasurements = useMemo(() => {
    if (config.corners === 0) return false;
    let edgeCount = 0;
    for (let i = 0; i < config.corners; i++) {
      const nextIndex = (i + 1) % config.corners;
      const edgeKey = `${String.fromCharCode(65 + i)}${String.fromCharCode(65 + nextIndex)}`;
      if (config.measurements[edgeKey] && config.measurements[edgeKey] > 0) {
        edgeCount++;
      }
    }
    return edgeCount === config.corners;
  }, [config.corners, config.measurements]);

  interface AddToCartOrderData {
    fabricType: string;
    fabricColor: string;
    edgeType: string;
    corners: number;
    unit: 'metric' | 'imperial' | '';
    measurementOption: 'adjust' | 'exact' | '';
    currency: string;
    measurements: Record<string, string | number | boolean>;
    points: Point[];
    fixingHeights: number[];
    fixingTypes?: string[];
    eyeOrientations?: string[];
    diagonalsInitiallyProvided?: boolean;
    canvasImage: string;
    area: number;
    perimeter: number;
    totalPrice: number;
    webbingWidth?: number;
    wireThickness?: number;
    // Remove selectedFabric from index signature to avoid type conflict
    // selectedFabric?: typeof selectedFabric;
    selectedColor?: string;
    acknowledgments: {
      customManufactured: boolean;
      measurementsAccurate: boolean;
      installationNotIncluded: boolean;
      structuralResponsibility: boolean;
    };
    freeShipping: boolean;
    noHiddenCosts: boolean;
    warranty: string;
    createdAt: string;
    // Remove selectedFabric from index signature to avoid type conflict
    // [key: string]: string | number | boolean | undefined;
  }


  const handleAddToCart = async (orderData: AddToCartOrderData): Promise<void> => {
    try {

      const response = await fetch('/apps/shade_space/api/v1/public/product/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      const data = await response.json()

      const { success, product, error } = data

      if (success && product) {
        console.log('product: ', product)

        const metafieldProperties = {};
        interface MetafieldNode {
          key: string;
          value: string;
          [key: string]: unknown;
        }

        interface MetafieldEdge {
          node: MetafieldNode;
        }

        interface MetafieldProperties {
          [key: string]: string;
        }

        (product.metafields.edges as MetafieldEdge[]).forEach((edge: MetafieldEdge) => {
          (metafieldProperties as MetafieldProperties)[
            edge.node.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
          ] = edge.node.value;
        });


        const gid = product?.variants?.edges?.[0].node?.id;
        const variantId = gid.split('/').pop();

        const formData = {
          items: [{
            id: Number(variantId),
            quantity: 1,
            properties: metafieldProperties
          }]
        };

        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        })

      } else if (!success && error) {
        console.log(error);
      }

    } catch (error) {
      console.error('Error adding to cart:', error);
    }
  };

  // Auto-center shape when moving between steps
  const centerShape = (points: Point[]): Point[] => {
    if (points.length === 0) return points;

    // Calculate current bounds
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y));

    // Calculate current center
    const currentCenterX = (minX + maxX) / 2;
    const currentCenterY = (minY + maxY) / 2;

    // Target center (canvas center)
    const targetCenterX = 300;
    const targetCenterY = 300;

    // Calculate offset needed
    const offsetX = targetCenterX - currentCenterX;
    const offsetY = targetCenterY - currentCenterY;

    // Apply offset to all points
    return points.map(point => ({
      x: Math.max(5, Math.min(595, point.x + offsetX)),
      y: Math.max(5, Math.min(595, point.y + offsetY))
    }));
  };

  const isStepComplete = (step: number): boolean => {
    switch (step) {
      case 0: // Fabric & Color
        return !!config.fabricType && config.fabricType !== '' && !!config.fabricColor && config.fabricColor !== '';
      case 1: // Style (Edge Type)
        return !!config.edgeType && config.edgeType !== '';
      case 2: // Number of Fixing Points
        return config.corners >= 3 && config.corners <= 6;
      case 3: // Measurement Options (Combined)
        return !!config.unit && config.unit !== '' && !!config.measurementOption && config.measurementOption !== '';
      case 4: // Dimensions
        if (config.corners === 0) {
          return false;
        }

        let edgeCount = 0;
        for (let i = 0; i < config.corners; i++) {
          const nextIndex = (i + 1) % config.corners;
          const edgeKey = `${String.fromCharCode(65 + i)}${String.fromCharCode(65 + nextIndex)}`;
          const measurement = config.measurements[edgeKey];
          if (measurement && measurement > 0) {
            edgeCount++;
          }
        }
        return edgeCount === config.corners;
      case 5: // Heights & Anchor Points
        // Check if we have all required data for all corners
        if (!config.fixingHeights || config.fixingHeights.length !== config.corners) return false;
        if (!config.fixingTypes || config.fixingTypes.length !== config.corners) return false;
        if (!config.eyeOrientations || config.eyeOrientations.length !== config.corners) return false;

        // Check if all heights are greater than 0
        const allHeightsValid = config.fixingHeights.every(height => height > 0);

        // Check if all types are selected
        const allTypesValid = config.fixingTypes.every(type => type === 'post' || type === 'building');

        // Check if all orientations are selected
        const allOrientationsValid = config.eyeOrientations.every(orientation => orientation === 'horizontal' || orientation === 'vertical');

        return allHeightsValid && allTypesValid && allOrientationsValid;
      case 6: // Review
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    // Clear previous validation errors
    setValidationErrors({});
    setTypoSuggestions({});

    // Perform validation for current step
    const errors: { [key: string]: string } = {};
    const suggestions: { [key: string]: number } = {};

    switch (openStep) {
      case 0: // Fabric & Color
        if (!config.fabricType || config.fabricType === '') {
          errors.fabricType = 'Please select a fabric type';
        }
        if (!config.fabricColor || config.fabricColor === '') {
          errors.fabricColor = 'Please select a fabric color';
        }
        break;
      case 1: // Style (Edge Type)
        if (!config.edgeType || config.edgeType === '') {
          errors.edgeType = 'Please select an edge reinforcement type';
        }
        break;
      case 2: // Number of Fixing Points
        if (config.corners < 3 || config.corners > 6) {
          errors.corners = 'Please select the number of fixing points (3-6)';
        }
        break;
      case 3: // Measurement Options
        if (!config.unit || config.unit === '') {
          errors.unit = 'Please select measurement units';
        }
        if (!config.measurementOption || config.measurementOption === '') {
          errors.measurementOption = 'Please select a measurement option';
        }
        break;
      case 4: // Dimensions
        const requiredDiagonals = getDiagonalKeysForCorners(config.corners);
        const allDiagonalsProvided = requiredDiagonals.every(key =>
          config.measurements[key] && config.measurements[key] > 0
        );

        // Update the flag to track if diagonals were initially provided on this step
        updateConfig({ diagonalsInitiallyProvided: allDiagonalsProvided });

        // Check perimeter limit (50m maximum)
        if (calculations.perimeter > 50) {
          if (config.unit === 'imperial') {
            const perimeterFt = calculations.perimeter * 3.28084; // Convert meters to feet
            const maxPerimeterFt = 50 * 3.28084; // 164.0 feet
            errors.perimeterTooLarge = `Shade sail is too large (${perimeterFt.toFixed(1)}ft perimeter). Maximum allowed is ${maxPerimeterFt.toFixed(0)}ft. Please re-check your measurements.`;
          } else {
            errors.perimeterTooLarge = `Shade sail is too large (${calculations.perimeter.toFixed(1)}m perimeter). Maximum allowed is 50m. Please re-check your measurements.`;
          }
        }

        // Validate measurements
        const measurementValidation = validateMeasurements(config.measurements, config.corners, config.unit);

        // Add measurement validation errors with specific messages
        Object.keys(measurementValidation.errors).forEach(key => {
          errors[key] = measurementValidation.errors[key];
        });

        // Add typo suggestions
        Object.keys(measurementValidation.typoSuggestions).forEach(key => {
          suggestions[key] = measurementValidation.typoSuggestions[key];
        });

        // Check for missing edge measurements
        for (let i = 0; i < config.corners; i++) {
          const nextIndex = (i + 1) % config.corners;
          const edgeKey = `${String.fromCharCode(65 + i)}${String.fromCharCode(65 + nextIndex)}`;
          const measurement = config.measurements[edgeKey];
          if (!measurement || measurement <= 0) {
            errors[edgeKey] = 'Measurement required';
          }
        }
        break;
      case 5: // Heights & Anchor Points
        // Validate heights
        const heightValidation = validateHeights(config.fixingHeights, config.unit);

        // Add height validation errors with specific messages
        Object.keys(heightValidation.errors).forEach(key => {
          errors[key] = heightValidation.errors[key];
        });

        // Add typo suggestions
        Object.keys(heightValidation.typoSuggestions).forEach(key => {
          suggestions[key] = heightValidation.typoSuggestions[key];
        });

        if (!config.fixingHeights || config.fixingHeights.length !== config.corners) {
          errors.fixingHeights = 'All anchor point heights are required';
        } else {
          config.fixingHeights.forEach((height, index) => {
            if (height <= 0) {
              errors[`height_${index}`] = 'Height measurement required';
            }
          });
        }
        if (!config.fixingTypes || config.fixingTypes.length !== config.corners) {
          errors.fixingTypes = 'All attachment types must be selected';
        } else {
          config.fixingTypes.forEach((type, index) => {
            if (type !== 'post' && type !== 'building') {
              errors[`type_${index}`] = 'Please select attachment type (post or building)';
            }
          });
        }
        if (!config.eyeOrientations || config.eyeOrientations.length !== config.corners) {
          errors.eyeOrientations = 'All eye orientations must be selected';
        } else {
          config.eyeOrientations.forEach((orientation, index) => {
            if (orientation !== 'horizontal' && orientation !== 'vertical') {
              errors[`orientation_${index}`] = 'Please select eye orientation (horizontal or vertical)';
            }
          });
        }
        break;
    }

    // If there are typo suggestions, prevent progression
    if (Object.keys(suggestions).length > 0) {
      errors.typoSuggestions = 'Please address all suggested corrections before continuing.';
    }

    // If there are any validation errors, block progression
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      setTypoSuggestions(suggestions);

      // Scroll to the first error field after a short delay to allow UI updates
      setTimeout(() => {
        // Prioritize scrolling to typo suggestions first
        if (Object.keys(suggestions).length > 0) {
          const typoElement = document.querySelector('.bg-amber-50') ||
            document.querySelector('.border-amber-500');
          if (typoElement) {
            typoElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });
          }
        } else {
          const firstErrorKey = Object.keys(errors)[0];
          if (firstErrorKey) {
            // Try to find and scroll to the first error element
            const errorElement = document.querySelector(`[data-error="${firstErrorKey}"]`) ||
              document.querySelector('.border-red-500') ||
              document.querySelector('.ring-red-500');
            if (errorElement) {
              errorElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
              });
            }
          }
        }
      }, 100);

      return; // Don't proceed to next step
    }

    // If no validation errors, proceed to next step
    const nextStepIndex = Math.min(6, openStep + 1);

    // Auto-center shape when moving to next step
    const centeredPoints = centerShape(config.points);

    setConfig(prev => ({ ...prev, step: nextStepIndex }));
    updateConfig({ points: centeredPoints });
    setOpenStep(nextStepIndex);

    // Scroll to the top of the next step after accordion animation completes
    setTimeout(() => {
      const nextStepElement = document.getElementById(`step-${nextStepIndex + 1}`);
      if (nextStepElement) {
        nextStepElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest'
        });
      }
    }, 350);
  };

  const prevStep = () => {
    const prevStepIndex = Math.max(0, openStep - 1);

    // Auto-center shape when moving to previous step
    const centeredPoints = centerShape(config.points);

    setConfig(prev => ({ ...prev, step: prevStepIndex }));
    updateConfig({ points: centeredPoints });
    setOpenStep(prevStepIndex);

    // Scroll to the top of the previous step after accordion animation completes
    setTimeout(() => {
      const prevStepElement = document.getElementById(`step-${prevStepIndex + 1}`);
      if (prevStepElement) {
        prevStepElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest'
        });
        // Additional scroll adjustment to ensure proper alignment
        setTimeout(() => {
          window.scrollBy(0, -20); // Small offset to account for any header spacing
        }, 300);
      }
    }, 350);
  };

  const toggleStep = (stepIndex: number) => {
    if (stepIndex <= config.step) {
      // Auto-center shape when switching steps
      const centeredPoints = centerShape(config.points);
      updateConfig({ points: centeredPoints });

      const newOpenStep = openStep === stepIndex ? -1 : stepIndex;
      setOpenStep(newOpenStep);

      // Scroll to the step being opened after accordion animation
      if (newOpenStep !== -1) {
        setTimeout(() => {
          const stepElement = document.getElementById(`step-${newOpenStep + 1}`);
          if (stepElement) {
            stepElement.scrollIntoView({
              behavior: 'smooth',
              block: 'start',
              inline: 'nearest'
            });
            // Small offset to position accordion header nicely at top
            setTimeout(() => {
              window.scrollBy(0, -20);
            }, 300);
          }
        }, 350);
      }
    }
  };

  const getStepSelection = (step: number): string => {
    switch (step) {
      case 0: // Fabric & Color
        const fabric = FABRICS.find(f => f.id === config.fabricType);
        const colorText = config.fabricColor ? ` - ${config.fabricColor}` : '';
        return fabric ? `${fabric.label}${colorText}` : 'Not selected';
      case 1: // Style (Edge Type)
        return config.edgeType === 'webbing' ? 'Webbing Reinforced' :
          config.edgeType === 'cabled' ? 'Cabled Edge' : 'Not selected';
      case 2: // Number of Fixing Points
        return config.corners ? `${config.corners} fixing points` : 'Not selected';
      case 3: // Measurement Options (Combined)
        const unitText = config.unit === 'metric' ? 'Metric' : config.unit === 'imperial' ? 'Imperial' : '';
        const optionText = config.measurementOption === 'adjust' ? 'Adjust to fit' :
          config.measurementOption === 'exact' ? 'Exact dimensions' : '';
        if (unitText && optionText) {
          return `${unitText}, ${optionText}`;
        } else if (unitText || optionText) {
          return unitText || optionText;
        }
        return 'Not selected';
      case 4: // Dimensions
        const measurementCount = Object.keys(config.measurements).length;
        // Count only edge measurements for display
        let edgeCount = 0;
        for (let i = 0; i < config.corners; i++) {
          const nextIndex = (i + 1) % config.corners;
          const edgeKey = `${String.fromCharCode(65 + i)}${String.fromCharCode(65 + nextIndex)}`;
          if (config.measurements[edgeKey] && config.measurements[edgeKey] > 0) {
            edgeCount++;
          }
        }
        return edgeCount === config.corners ? `${edgeCount} edge measurements entered` : `${edgeCount}/${config.corners} edges measured`;
      case 5: // Heights & Anchor Points
        if (!config.fixingHeights || config.fixingHeights.length !== config.corners) return 'Not configured';
        if (!config.fixingTypes || config.fixingTypes.length !== config.corners) return 'Not configured';
        if (!config.eyeOrientations || config.eyeOrientations.length !== config.corners) return 'Not configured';

        const validHeights = config.fixingHeights.filter(h => h > 0).length;
        const validTypes = config.fixingTypes.filter(t => t === 'post' || t === 'building').length;
        const validOrientations = config.eyeOrientations.filter(o => o === 'horizontal' || o === 'vertical').length;

        if (validHeights === config.corners && validTypes === config.corners && validOrientations === config.corners) {
          return `${config.corners} anchor points configured`;
        } else {
          return `${Math.min(validHeights, validTypes, validOrientations)}/${config.corners} anchor points configured`;
        }
      case 6: // Review
        return 'Ready for purchase';
      default:
        return 'Not selected';
    }
  };

  // Define step titles for navigation
  const stepTitles = [
    'Style',
    'Fixing Points',
    'Measurement Options',
    'Dimensions',
    'Heights & Anchor Points',
    'Review & Purchase',
    '' // No next step after review
  ];

  const getNextStepTitle = (currentStep: number) => stepTitles[currentStep] || '';
  const shouldShowBackButton = (currentStep: number) => currentStep > 0;

  const steps = [
    {
      title: 'Fabric & Color',
      subtitle: 'Select your preferred fabric type and color',
      component: FabricSelectionContent
    },
    {
      title: 'Style',
      subtitle: 'Select edge reinforcement type',
      component: EdgeTypeContent
    },
    {
      title: 'Number of Fixing Points',
      subtitle: 'How many fixing points will your shade sail have?',
      component: CornersContent
    },
    {
      title: 'Measurement Options',
      subtitle: 'Choose units and measurement handling',
      component: CombinedMeasurementContent
    },
    {
      title: 'Dimensions',
      subtitle: 'Set precise measurements',
      component: DimensionsContent
    },
    {
      title: 'Heights & Anchor Points',
      subtitle: 'Configure attachment points',
      component: FixingPointsContent
    },
    {
      title: 'Review & Purchase',
      subtitle: 'Confirm your order',
      component: ReviewContent
    }
  ];

  return (
    <div className="max-w-6xl mx-auto px-8 py-8 pb-16">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="mb-4">
          <a
            href="https://shadespace.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block hover:opacity-80 transition-opacity duration-200"
          >
            <img
              src="https://cdn.shopify.com/s/files/1/0778/8730/7969/files/Logo-horizontal-color_3x_8d83ab71-75cc-4486-8cf3-b510cdb69aa7.png?v=1728339550"
              alt="ShadeSpace Logo"
              className="mx-auto h-12 sm:h-16 md:h-20 lg:h-24 w-auto max-w-full"
            />
          </a>
        </div>
        <p className="text-xl text-[#01312D]/70 max-w-2xl mx-auto font-extrabold" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Design your perfect shade solution with our interactive configurator
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Accordion Steps */}
        <div className={`space-y-2 min-h-0 ${openStep === 4 // Dimensions step
          ? 'lg:col-span-2'
          : openStep >= 5 // Review step
            ? 'lg:col-span-3'
            : 'lg:col-span-4'
          }`}>
          {steps.map((step, index) => {
            const StepComponent = step.component;
            const isCompleted = index < config.step;
            const isCurrent = index === config.step;
            const isOpen = openStep === index;
            const canOpen = index <= config.step;
            const selection = getStepSelection(index);

            // On mobile, show current step, completed steps, and the next available step
            if (isMobile && index > config.step) {
              return null;
            }

            return (
              <AccordionStep
                key={index}
                title={step.title}
                subtitle={step.subtitle}
                stepNumber={index + 1}
                isCompleted={isCompleted}
                isCurrent={isCurrent}
                isOpen={isOpen}
                canOpen={canOpen}
                selection={selection}
                onToggle={() => toggleStep(index)}
              >
                <StepComponent
                  config={config}
                  updateConfig={updateConfig}
                  calculations={calculations}
                  validationErrors={validationErrors}
                  typoSuggestions={typoSuggestions}
                  onNext={nextStep}
                  onPrev={prevStep}
                  setValidationErrors={setValidationErrors}
                  setTypoSuggestions={setTypoSuggestions}
                  setConfig={setConfig}
                  setOpenStep={setOpenStep}
                  // Pricing and order props for ReviewContent
                  isGeneratingPDF={isGeneratingPDF}
                  handleGeneratePDF={handleGeneratePDF}
                  showEmailInput={showEmailInput}
                  email={email}
                  setEmail={setEmail}
                  handleEmailSummary={handleEmailSummary}
                  acknowledgments={acknowledgments}
                  handleAcknowledgmentChange={handleAcknowledgmentChange}
                  handleAddToCart={handleAddToCart}
                  allDiagonalsEntered={allDiagonalsEntered}
                  allAcknowledgmentsChecked={allAcknowledgmentsChecked}
                  canAddToCart={canAddToCart}
                  hasAllEdgeMeasurements={hasAllEdgeMeasurements}
                  handleCancelEmailInput={handleCancelEmailInput}
                  nextStepTitle={getNextStepTitle(index)}
                  showBackButton={shouldShowBackButton(index)}
                  isMobile={isMobile}
                  setHighlightedMeasurement={setHighlightedMeasurement}
                  highlightedMeasurement={highlightedMeasurement}
                  canvasRef={canvasRef}
                  ref={index === 6 ? reviewContentRef : undefined}
                />
              </AccordionStep>
            );
          })}
        </div>

        {/* Sticky Diagram for Dimensions Step - Desktop Only */}
        {openStep === 4 && !isMobile && (
          <div className="hidden lg:block lg:col-span-2 lg:sticky lg:top-8 lg:self-start z-10">
            <h4 className="text-lg font-semibold text-slate-900 mb-4">
              Interactive Measurement Guide
            </h4>

            {/* Canvas Tip */}
            <div className="p-3 bg-[#BFF102]/10 border border-[#307C31]/30 rounded-lg mb-4">
              <p className="text-sm text-[#01312D]">
                <strong>Tip:</strong> Drag the corners on the canvas to visualize your shape.
                Enter measurements in the fields to the right to calculate pricing. All measurements are in {config.unit === 'imperial' ? 'inches' : 'millimeters'}.
              </p>
            </div>

            <ShapeCanvas
              config={config}
              updateConfig={updateConfig}
              readonly={false}
              snapToGrid={true}
              highlightedMeasurement={highlightedMeasurement}
              isMobile={isMobile}
            />
          </div>
        )}

        {/* Desktop Pricing Summary - Sticky Sidebar (Dimensions & Review steps) */}
        {(openStep >= 5) && !isMobile && (
          <div className="hidden lg:block lg:col-span-1 lg:sticky lg:top-8 lg:self-start z-10 space-y-4">
            <PriceSummaryDisplay
              config={config}
              calculations={calculations}
            />

            {/* Desktop PDF and Email Buttons */}
            {calculations.totalPrice > 0 && (
              <div className="space-y-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGeneratePDFWithSVG}
                  disabled={isGeneratingPDF}
                  className="w-full"
                >
                  {isGeneratingPDF ? 'Generating...' : 'Download PDF Quote'}
                </Button>

                {!showEmailInput ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleEmailSummary}
                    className="w-full"
                  >
                    Email Summary
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="w-full"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleEmailSummary}
                        className="w-full"
                      >
                        Send Email
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelEmailInput}
                        className="w-full"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}