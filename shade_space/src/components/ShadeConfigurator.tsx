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
import { validateMeasurements, validateHeights, getDiagonalKeysForCorners, formatDualMeasurement, getDualMeasurementValues } from '../utils/geometry';
import { generatePDF } from '../utils/pdfGenerator';
import { ShapeCanvas } from './ShapeCanvas';
import { EXCHANGE_RATES } from '../data/pricing'; // Import EXCHANGE_RATES to check supported currencies
import { formatMeasurement, formatArea } from '../utils/geometry';
import { useToast } from "../components/ui/ToastProvider";
import { LoadingOverlay } from './ui/loader';
import { SaveQuoteModal } from './SaveQuoteModal';
import { MobilePricingBar } from './MobilePricingBar';
import { getQuoteFromUrl, getQuoteById, updateQuoteStatus, markQuoteConverted } from '../utils/quoteManager';
import { addQuoteToken } from '../utils/tokenManager';
import { analytics } from '../utils/analytics';

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
  fixingPointsInstalled: undefined,
  currency: 'NZD'
};

console.log('🚀 ShadeConfigurator component is loading - this should appear in console');

export function ShadeConfigurator() {
  const [config, setConfig] = useState<ConfiguratorState>(INITIAL_STATE);
  const [openStep, setOpenStep] = useState<number>(0);
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});
  const [typoSuggestions, setTypoSuggestions] = useState<{ [key: string]: number }>({});
  const [dismissedTypoSuggestions, setDismissedTypoSuggestions] = useState<Set<string>>(new Set());
  const [isMobile, setIsMobile] = useState<boolean>(false);
  console.log('isMobile: ', isMobile);
  const reviewContentRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  // Pricing and order state (lifted from ReviewContent)
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [acknowledgments, setAcknowledgments] = useState({
    customManufactured: false,
    measurementsAccurate: false,
    installationNotIncluded: false,
    structuralResponsibility: false
  });
  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const [loadingStep, setLoadingStep] = useState({
    text: 'Preparing your order...',
    progress: 0
  });

  // Quote management state
  const [showSaveQuoteModal, setShowSaveQuoteModal] = useState(false);
  const [quoteReference, setQuoteReference] = useState<string | null>(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);

  // Highlighted measurement state for sticky diagram
  const [highlightedMeasurement, setHighlightedMeasurement] = useState<string | null>(null);

  // Mobile pricing bar state
  const [isBarLocked, setIsBarLocked] = useState(false);
  const [isNewQuote, setIsNewQuote] = useState(false);
  const [previousTotalPrice, setPreviousTotalPrice] = useState(0);

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

  // Load saved quote from URL if present
  useEffect(() => {
    const loadQuoteFromUrl = async () => {
      const quoteData = getQuoteFromUrl();
      if (!quoteData) return;

      setIsLoadingQuote(true);

      // Track load attempt
      analytics.quoteLoadAttempted({
        quote_id: quoteData.id,
        source: 'url_parameter',
      });

      try {
        const quote = await getQuoteById(quoteData.id, quoteData.token);

        // Store the token locally for future access
        addQuoteToken(
          quote.id,
          quoteData.token,
          quote.quote_name,
          quote.quote_reference,
          quote.expires_at,
          quote.customer_email || undefined
        );

        // Calculate quote age
        const createdAt = new Date(quote.created_at);
        const quoteAgeHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

        // Restore configuration
        setConfig(quote.config_data);
        setQuoteReference(quote.quote_reference);

        // Jump to step 4 (where pricing is visible)
        setOpenStep(4);

        // Track successful load
        analytics.quoteLoadSuccess({
          quote_reference: quote.quote_reference,
          quote_age_hours: quoteAgeHours,
          landing_step: 4,
          had_email: !!quote.customer_email,
          total_price: quote.calculations_data.totalPrice,
          currency: quote.config_data.currency,
        });

        showToast(`Quote ${quote.quote_reference} loaded successfully!`, 'success');
      } catch (error: any) {
        console.error('Failed to load quote:', error);

        analytics.quoteLoadFailed({
          quote_id: quoteData.id,
          error_message: error?.message || 'Unknown error',
          error_type: error?.name || 'LoadError',
        });

        showToast(
          'Failed to load quote. It may have expired, been deleted, or you may not have access.',
          'error'
        );
      } finally {
        setIsLoadingQuote(false);
      }
    };

    loadQuoteFromUrl();
  }, []);

  // Manage mobile pricing bar lock and new quote detection
  useEffect(() => {
    if (isMobile && openStep === 4 && calculations.totalPrice > 0 && previousTotalPrice === 0) {
      // Quote just became available for the first time
      setIsNewQuote(true);
      setIsBarLocked(true);

      // Set a timer to unlock after 15 seconds
      const unlockTimer = setTimeout(() => {
        setIsBarLocked(false);
        setIsNewQuote(false);
      }, 15000);

      return () => clearTimeout(unlockTimer);
    } else if (calculations.totalPrice === 0) {
      // Reset when price goes back to 0
      setIsNewQuote(false);
      setIsBarLocked(false);
    }

    // Update previous price for next comparison
    if (calculations.totalPrice !== previousTotalPrice) {
      setPreviousTotalPrice(calculations.totalPrice);
    }
  }, [calculations.totalPrice, openStep, isMobile, previousTotalPrice]);

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

  const dismissTypoSuggestion = (fieldKey: string) => {
    const newSuggestions = { ...typoSuggestions };
    delete newSuggestions[fieldKey];
    setTypoSuggestions(newSuggestions);

    const newDismissed = new Set(dismissedTypoSuggestions);
    newDismissed.add(fieldKey);
    setDismissedTypoSuggestions(newDismissed);
  };

  const selectedFabric = FABRICS.find(f => f.id === config.fabricType);

  // Pricing and order handlers (lifted from ReviewContent)
  const handleGeneratePDF = async (svgElement?: SVGElement, isEmailSummary?: boolean) => {
    setIsGeneratingPDF(true);
    try {
      const pdf = await generatePDF(config, calculations, svgElement, isEmailSummary);
      return pdf
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
  const handleGeneratePDFWithSVG = async (isEmailSummary: boolean) => {
    const svgElement = canvasRef.current?.getSVGElement?.();
    const pdf = await handleGeneratePDF(svgElement, isEmailSummary);
    return pdf;
  };

  const convertSvgToPng = async (
    svgElement: SVGSVGElement,
    width?: number,
    height?: number
  ): Promise<Blob> => {
    return new Promise<Blob>((resolve, reject) => {
      try {
        // Serialize SVG to string
        const svgString: string = new XMLSerializer().serializeToString(svgElement);

        // Create a blob from the SVG string
        const svgBlob: Blob = new Blob([svgString], { type: 'image/svg+xml' });
        const svgUrl: string = URL.createObjectURL(svgBlob);

        // Create an image element
        const img: HTMLImageElement = new Image();
        img.onload = function () {
          // Create a canvas with the desired dimensions
          const canvas: HTMLCanvasElement = document.createElement('canvas');
          canvas.width = width || img.width;
          canvas.height = height || img.height;

          // Draw the image on the canvas
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Convert canvas to PNG
            const pngUrl: string = canvas.toDataURL('image/png');

            // Clean up
            URL.revokeObjectURL(svgUrl);

            // Convert data URL to blob
            fetch(pngUrl)
              .then(res => res.blob())
              .then((blob: Blob) => {
                resolve(blob);
              })
              .catch(error => reject(error));
          } else {
            URL.revokeObjectURL(svgUrl);
            reject(new Error('Failed to get canvas context'));
          }
        };

        img.onerror = function () {
          URL.revokeObjectURL(svgUrl);
          reject(new Error('Failed to load SVG image'));
        };

        img.src = svgUrl;
      } catch (error) {
        reject(error as Error);
      }
    });
  };


  // Add this function to your component
  const uploadImageToShopify = async (blob: Blob, filename: string): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', blob, filename);

      const response = await fetch('/apps/shade_space/api/v1/public/file/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload image to Shopify');
      }

      const result = await response.json();

      if (result.success && result.url) {
        return result.url;
      } else {
        console.error('Shopify upload failed:', result.error);
        return null;
      }
    } catch (error) {
      console.error('Error uploading image to Shopify:', error);
      return null;
    }
  };

  const handleEmailSummary = async () => {
    try {
      if (!showEmailInput) {
        setShowEmailInput(true);
        return;
      }

      if (!email.trim()) {
        setShowEmailInput(false);
        setEmail('');
        return;
      }

      setIsSendingEmail(true); // ✅ Start loading

      await new Promise(resolve => setTimeout(resolve, 0));

      const pdf = await handleGeneratePDFWithSVG(true);

      // Get the SVG element and upload preview
      const svgElement = canvasRef.current?.getSVGElement();
      let canvasImageUrl = null;

      if (svgElement) {
        try {
          const canvasImageBlob = await convertSvgToPng(svgElement, 600, 500);
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `shade-sail-${config.corners}corner-${timestamp}.png`;
          canvasImageUrl = await uploadImageToShopify(canvasImageBlob, filename);
          if (!canvasImageUrl) {
            console.warn('Failed to upload canvas image to Shopify, proceeding without image');
          }
        } catch (error) {
          console.error('Error processing canvas image:', error);
        }
      }

      const selectedFabric = FABRICS.find(f => f.id === config.fabricType);
      const selectedColor = selectedFabric?.colors.find(c => c.name === config.fabricColor);

      const edgeMeasurements: Record<string, { unit: string; formatted: string }> = {};
      for (let i = 0; i < config.corners; i++) {
        const nextIndex = (i + 1) % config.corners;
        const edgeKey = `${String.fromCharCode(65 + i)}${String.fromCharCode(65 + nextIndex)}`;
        const measurement = config.measurements[edgeKey];
        if (measurement && measurement > 0) {
          edgeMeasurements[edgeKey] = {
            unit: config.unit === 'imperial' ? 'inches' : 'millimeters',
            formatted: formatMeasurement(measurement, config.unit)
          };
        }
      }

      const diagonalMeasurementsObj: Record<string, { unit: string; formatted: string }> = {};
      const diagonalKeys =
        config.corners === 4 ? ['AC', 'BD'] :
          config.corners === 5 ? ['AC', 'AD', 'CE', 'BD', 'BE'] :
            config.corners === 6 ? ['AC', 'AD', 'AE', 'BD', 'BE', 'BF', 'CE', 'CF', 'DF'] :
              [];

      diagonalKeys.forEach(key => {
        const measurement = config.measurements[key];
        if (measurement && measurement > 0) {
          diagonalMeasurementsObj[key] = {
            unit: config.unit === 'imperial' ? 'inches' : 'millimeters',
            formatted: formatMeasurement(measurement, config.unit)
          };
        }
      });

      const anchorPointMeasurements: Record<string, { unit: string; formatted: string }> = {};
      config.fixingHeights.forEach((height, index) => {
        const corner = String.fromCharCode(65 + index);
        anchorPointMeasurements[corner] = {
          unit: config.unit === 'imperial' ? 'inches' : 'millimeters',
          formatted: formatMeasurement(height, config.unit)
        };
      });

      // Create backend-only dual measurement objects for email to fulfillment team
      const backendEdgeMeasurementsEmail: Record<string, string> = {};
      for (let i = 0; i < config.corners; i++) {
        const nextIndex = (i + 1) % config.corners;
        const edgeKey = `${String.fromCharCode(65 + i)}${String.fromCharCode(65 + nextIndex)}`;
        const measurement = config.measurements[edgeKey];
        if (measurement && measurement > 0) {
          backendEdgeMeasurementsEmail[edgeKey] = formatDualMeasurement(measurement, config.unit);
        }
      }

      const backendDiagonalMeasurementsEmail: Record<string, string> = {};
      diagonalKeys.forEach(key => {
        const measurement = config.measurements[key];
        if (measurement && measurement > 0) {
          backendDiagonalMeasurementsEmail[key] = formatDualMeasurement(measurement, config.unit);
        }
      });

      const backendAnchorMeasurementsEmail: Record<string, string> = {};
      config.fixingHeights.forEach((height, index) => {
        const corner = String.fromCharCode(65 + index);
        if (height && height > 0) {
          backendAnchorMeasurementsEmail[corner] = formatDualMeasurement(height, config.unit);
        }
      });

      const userCurrency = window.Shopify?.currency?.active || 'USD';
      console.log('userCurrency: ', userCurrency);

      const exchangeRate = parseFloat(window.Shopify?.currency?.rate || '1');
      console.log('exchangeRate: ', exchangeRate);

      // Convert amount using Shopify's rate
      const convertedAmount = calculations?.totalPrice * exchangeRate;
      console.log('convertedAmount: ', convertedAmount);

      const orderData = {
        fabricType: config.fabricType,
        fabricColor: config.fabricColor,
        edgeType: config.edgeType,
        corners: config.corners,
        unit: config.unit,
        currency: userCurrency,
        measurements: config.measurements,
        area: calculations.area,
        perimeter: calculations.perimeter,
        totalPrice: convertedAmount.toFixed(2),
        selectedFabric,
        selectedColor,
        warranty: selectedFabric?.warrantyYears || "",
        fixingHeights: config.fixingHeights,
        fixingTypes: config.fixingTypes,
        fixingPointsInstalled: config.fixingPointsInstalled,
        ...(config.fixingPointsInstalled === true && { eyeOrientations: config.eyeOrientations }),
        edgeMeasurements,
        diagonalMeasurementsObj,
        anchorPointMeasurements,
        Fabric_Type: config.fabricType === 'extrablock330' && ['Yellow', 'Red', 'Cream', 'Beige'].includes(config.fabricColor)
          ? 'Not FR Certified'
          : selectedFabric?.label,
        Shade_Factor: selectedColor?.shadeFactor,
        Edge_Type: config.edgeType === 'webbing' ? 'Webbing Reinforced' : 'Cabled Edge',
        Wire_Thickness: config.unit === 'imperial'
          ? calculations?.wireThickness !== undefined
            ? `${(calculations.wireThickness * 0.0393701).toFixed(2)}"`
            : 'N/A'
          : calculations?.wireThickness !== undefined
            ? `${calculations.wireThickness}mm`
            : 'N/A',
        Area: formatArea(calculations.area * 1000000, config.unit),
        Perimeter: formatMeasurement(calculations.perimeter * 1000, config.unit),
        canvasImage: canvasImageUrl,
        createdAt: new Date().toISOString(),
        // Add dual measurements for backend/fulfillment team emails
        backendEdgeMeasurements: backendEdgeMeasurementsEmail,
        backendDiagonalMeasurements: backendDiagonalMeasurementsEmail,
        backendAnchorMeasurements: backendAnchorMeasurementsEmail,
        originalUnit: config.unit
      };

      const response = await fetch(
        '/apps/shade_space/api/v1/public/email-summary-send',
        {
          method: "POST",
          body: JSON.stringify({ pdf, ...orderData, email }),
        }
      );

      const data = await response.json();

      if (data.success) {
        const emailDomain = email.split('@')[1] || 'unknown';

        // Track email summary sent
        analytics.emailSummaryWithShopify({
          email_domain: emailDomain,
          includes_pdf: !!pdf,
          includes_canvas: !!canvasImageUrl,
          total_price: calculations.totalPrice,
          currency: config.currency,
          shopify_customer_created: data.shopifyCustomerCreated || false,
          shopify_customer_id: data.shopifyCustomerId,
        });

        // Track Shopify customer creation if it happened
        if (data.shopifyCustomerCreated && data.shopifyCustomerId) {
          analytics.shopifyCustomerCreated({
            customer_id: data.shopifyCustomerId,
            email_domain: emailDomain,
            source: 'email_summary',
            tags: ['quote_saved', 'email_summary_requested'],
            total_quote_value: calculations.totalPrice,
            currency: config.currency,
          });
        }

        showToast(data.message, "success");
        setShowEmailInput(false);
        setEmail('');
      } else {
        const emailDomain = email.split('@')[1] || 'unknown';

        analytics.emailSendFailed({
          error_message: data.error || 'Unknown error',
          error_type: 'EmailSendError',
        });

        showToast(data.error || "Failed to send email", "error");
      }
    } catch (error: any) {
      console.error("Email send failed:", error);

      analytics.emailSendFailed({
        error_message: error?.message || 'Unknown error',
        error_type: error?.name || 'EmailSendError',
      });

      showToast("An unexpected error occurred while sending email.", "error");
    } finally {
      setIsSendingEmail(false);
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

  interface OrderData {
    fabricType: string;
    fabricColor: string;
    edgeType: string;
    corners: number;
    unit: 'metric' | 'imperial' | '';
    measurementOption: 'adjust' | 'exact' | '';
    hardware_included: 'Included' | 'Not Included';
    currency: string;
    measurements: Record<string, number>;
    points: Point[];
    fixingHeights: number[];
    fixingTypes?: string[];
    eyeOrientations?: string[];
    diagonalsInitiallyProvided?: boolean;
    area: number;
    perimeter: number;
    totalPrice: number;
    webbingWidth?: number;
    wireThickness?: number;
    selectedFabric: {
      id: string;
      label: string;
      weightPerSqm: number;
      uvProtection: string;
      warrantyYears: number;
      madeIn: string;
      detailedDescription: string;
      benefits: string[];
      bestFor: string[];
    };
    selectedColor: {
      name: string;
      shadeFactor: number;
      imageUrl?: string;
    };
    canvasImageUrl: string;
    warranty: string;
    Fabric_Type: string;
    Shade_Factor: string;
    Edge_Type: string;
    Wire_Thickness: string;
    Area: string;
    Perimeter: string;
    createdAt: string;
    // Edge measurements (A→B, B→C, etc.)
    [edgeKey: string]: string | number | boolean | object | undefined;
    backendEdgeMeasurements: Record<string, string>;
    backendDiagonalMeasurements: Record<string, string>;
    backendAnchorMeasurements: Record<string, string>;
    originalUnit: 'metric' | 'imperial';
  }


  const handleAddToCart = async (orderData: OrderData): Promise<void> => {
    console.log('Product being created. Add to cart');
    setShowLoadingOverlay(true);
    setLoadingStep({ text: 'Starting order process...', progress: 10 });
    setLoading(true);

    // Check if this is a converted quote
    const quoteParams = getQuoteFromUrl();
    let quoteData: any = null;

    if (quoteReference && quoteParams) {
      try {
        quoteData = await getQuoteById(quoteParams.id, quoteParams.token);
      } catch (error) {
        console.error('Failed to load quote data for conversion tracking:', error);
      }
    }

    try {
      setLoadingStep({ text: 'Creating your custom product...', progress: 30 });

      // Format measurements for cart display
      const formatCartProperties = (measurements: any) => {
        const formatted: Record<string, string> = {};

        Object.keys(measurements).forEach(key => {
          if (measurements[key] && typeof measurements[key] === 'object' && measurements[key].formatted) {
            formatted[key] = measurements[key].formatted;
          }
        });

        return formatted;
      };

      const cartEdgeMeasurements = formatCartProperties(orderData.edgeMeasurements);
      const cartDiagonalMeasurements = formatCartProperties(orderData.diagonalMeasurementsObj);
      const cartAnchorMeasurements = formatCartProperties(orderData.anchorPointMeasurements);

      // Create backend-only dual measurement objects for Shopify admin
      const backendEdgeMeasurements: Record<string, string> = {};
      Object.keys(orderData.edgeMeasurements || {}).forEach(key => {
        const measurement = config.measurements[key];
        if (measurement && measurement > 0) {
          backendEdgeMeasurements[key] = formatDualMeasurement(measurement, config.unit);
        }
      });

      const backendDiagonalMeasurements: Record<string, string> = {};
      const diagonalKeys = getDiagonalKeysForCorners(config.corners);
      diagonalKeys.forEach(key => {
        const measurement = config.measurements[key];
        if (measurement && measurement > 0) {
          backendDiagonalMeasurements[key] = formatDualMeasurement(measurement, config.unit);
        }
      });

      const backendAnchorMeasurements: Record<string, string> = {};
      config.fixingHeights.forEach((height, index) => {
        const corner = String.fromCharCode(65 + index);
        if (height && height > 0) {
          backendAnchorMeasurements[corner] = formatDualMeasurement(height, config.unit);
        }
      });

      // Format arrays for cart display
      const formatArrayForCart = (array: any[], label: string) => {
        if (!array || !Array.isArray(array)) return {};

        const result: Record<string, string> = {};
        array.forEach((item, index) => {
          const corner = String.fromCharCode(65 + index);
          result[`${label} ${corner}`] = typeof item === 'string' ? item : String(item);
        });
        return result;
      };

      const cartFixingHeights = formatArrayForCart(orderData.fixingHeights, 'Fixing Height');
      const cartFixingTypes = formatArrayForCart(orderData.fixingTypes, 'Fixing Type');
      const cartEyeOrientations = orderData.fixingPointsInstalled === true
        ? formatArrayForCart(orderData.eyeOrientations, 'Eye Orientation')
        : {};

      const response = await fetch('/apps/shade_space/api/v1/public/product/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...orderData,
          // Pass formatted properties for cart display (customer-facing, single unit)
          cartEdgeMeasurements,
          cartDiagonalMeasurements,
          cartAnchorMeasurements,
          cartFixingHeights,
          cartFixingTypes,
          ...(orderData.fixingPointsInstalled === true && { cartEyeOrientations }),
          // Pass dual measurements for backend/fulfillment (Shopify admin only)
          backendEdgeMeasurements,
          backendDiagonalMeasurements,
          backendAnchorMeasurements,
          originalUnit: config.unit
        }),
      });

      const data = await response.json();
      const { success, product, error } = data;

      if (success && product) {
        console.log('Product created... Adding to cart');
        setLoadingStep({ text: 'Processing product details...', progress: 60 });

        const metafieldProperties: Record<string, string> = {};

        // Only include specific metafields in cart properties (exclude the ones you want to hide)
        const allowedCartProperties = [
          'fabric_material',
          'fabric_color',
          'fabric_certification_type',
          'edge_type',
          'wire_thickness',
          'corners',
          'area',
          'perimeter'
        ];

        product.metafields.edges.forEach((edge: any) => {
          // Only include allowed properties in cart display
          if (allowedCartProperties.includes(edge.node.key)) {
            const key = edge.node.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            metafieldProperties[key] = edge.node.value;
          }
        });

        metafieldProperties['Hardware Included'] = orderData.hardware_included || 'Not Included';

        // Add formatted cart properties (these will show in cart)
        Object.entries(cartEdgeMeasurements).forEach(([key, value]) => {
          metafieldProperties[`Edge ${key}`] = value;
        });

        Object.entries(cartDiagonalMeasurements).forEach(([key, value]) => {
          metafieldProperties[`Diagonal ${key}`] = value;
        });

        Object.entries(cartAnchorMeasurements).forEach(([key, value]) => {
          metafieldProperties[`Anchor Height ${key}`] = value;
        });

        Object.entries(cartFixingHeights).forEach(([key, value]) => {
          metafieldProperties[key] = value;
        });

        Object.entries(cartFixingTypes).forEach(([key, value]) => {
          metafieldProperties[key] = value;
        });

        // Only add eye orientation properties if fixing points are installed
        if (orderData.fixingPointsInstalled === true) {
          Object.entries(cartEyeOrientations).forEach(([key, value]) => {
            metafieldProperties[key] = value;
          });
        }

        const gid = product?.variants?.edges?.[0]?.node?.id;
        if (gid) {
          const variantId = gid.split('/').pop();

          const formData = {
            items: [{
              id: Number(variantId),
              quantity: 1,
              properties: metafieldProperties
            }]
          };

          console.log('Add to cart in progress');
          setLoadingStep({ text: 'Adding item to your cart...', progress: 85 });

          const cartResponse = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });

          if (cartResponse.ok) {
            console.log('Added to cart');

            // Track quote conversion if applicable
            if (quoteData && quoteParams) {
              try {
                const createdAt = new Date(quoteData.created_at);
                const quoteAgeHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

                analytics.quoteConvertedToCart({
                  quote_reference: quoteReference!,
                  quote_age_hours: quoteAgeHours,
                  time_from_save_to_cart_hours: quoteAgeHours,
                  total_price: calculations.totalPrice,
                  currency: config.currency,
                  conversion_source: 'loaded_quote',
                });

                // Mark quote as converted
                await markQuoteConverted(quoteParams.id, quoteParams.token);
              } catch (error) {
                console.error('Failed to track quote conversion:', error);
              }
            }

            setLoadingStep({ text: 'Order complete! Redirecting...', progress: 100 });
            window.location.href = '/cart';
          } else {
            console.error('Failed to add to cart');
            setShowLoadingOverlay(false);
            setLoading(false);
          }
        } else {
          console.error('No variant found in product');
          setShowLoadingOverlay(false);
          setLoading(false);
        }
      } else if (!success && error) {
        console.error('Product creation failed:', error);
        setShowLoadingOverlay(false);
        setLoading(false);
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      setShowLoadingOverlay(false);
      setLoading(false);
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
        // Check if fixing points installation status is selected
        if (config.fixingPointsInstalled === undefined) return false;

        // Check if we have all required data for all corners
        if (!config.fixingHeights || config.fixingHeights.length !== config.corners) return false;
        if (!config.fixingTypes || config.fixingTypes.length !== config.corners) return false;

        // Check if all heights are valid (not undefined, not null, and greater than 0)
        const allHeightsValid = config.fixingHeights.every(height =>
          height !== undefined && height !== null && height > 0
        );

        // Check if all types are selected
        const allTypesValid = config.fixingTypes.every(type => type === 'post' || type === 'building');

        // If fixing points are installed, also check eye orientations
        if (config.fixingPointsInstalled === true) {
          if (!config.eyeOrientations || config.eyeOrientations.length !== config.corners) return false;
          const allOrientationsValid = config.eyeOrientations.every(orientation => orientation === 'horizontal' || orientation === 'vertical');
          return allHeightsValid && allTypesValid && allOrientationsValid;
        }

        // If fixing points are not installed, eye orientations are not required
        return allHeightsValid && allTypesValid;
      case 6: // Review
        return true;
      default:
        return true;
    }
  };

  const smoothScrollToStep = (stepNumber: number) => {
    const stepElement = document.getElementById(`step-${stepNumber + 1}`);
    if (!stepElement) return;

    const isMobileView = window.innerWidth < 1024;
    const headerOffset = isMobileView ? 120 : 140;

    const elementPosition = stepElement.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
  };

  const scrollToErrorField = (errorKey: string, isTypoSuggestion: boolean = false) => {
    setTimeout(() => {
      let targetElement: Element | null = null;

      if (isTypoSuggestion) {
        targetElement = document.querySelector('.bg-amber-50') ||
          document.querySelector('.border-amber-500');
      } else {
        targetElement = document.querySelector(`[data-error="${errorKey}"]`) ||
          document.querySelector('input.border-red-500') ||
          document.querySelector('.border-red-500');
      }

      if (targetElement) {
        const isMobileView = window.innerWidth < 1024;
        const headerOffset = isMobileView ? 100 : 120;
        const viewportOffset = window.innerHeight * 0.2;

        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset - viewportOffset;

        window.scrollTo({
          top: Math.max(0, offsetPosition),
          behavior: 'smooth'
        });

        setTimeout(() => {
          targetElement?.classList.add('pulse-error');
          setTimeout(() => {
            targetElement?.classList.remove('pulse-error');
          }, 2000);
        }, 400);
      }
    }, 100);
  };

  const nextStep = () => {
    // Clear previous validation errors and dismissed typo tracking
    setValidationErrors({});
    setTypoSuggestions({});
    setDismissedTypoSuggestions(new Set());

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
        // PRIORITY CHECK: Installation status must be selected first
        if (config.fixingPointsInstalled === undefined) {
          errors.fixingPointsInstalled = 'Please answer whether your fixing points are already installed first';
          // Don't validate dependent fields until installation status is selected
          break;
        }

        // Only validate dependent fields after installation status is selected
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
            if (height === undefined || height === null || height <= 0) {
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
        // Only validate eye orientations if fixing points are installed
        if (config.fixingPointsInstalled === true) {
          if (!config.eyeOrientations || config.eyeOrientations.length !== config.corners) {
            errors.eyeOrientations = 'All eye orientations must be selected';
          } else {
            config.eyeOrientations.forEach((orientation, index) => {
              if (orientation !== 'horizontal' && orientation !== 'vertical') {
                errors[`orientation_${index}`] = 'Please select eye orientation (horizontal or vertical)';
              }
            });
          }
        }
        break;
    }

    // Update typo suggestions state
    setTypoSuggestions(suggestions);

    // Check for unacknowledged typo suggestions (suggestions that haven't been dismissed or corrected)
    const unacknowledgedTypos = Object.keys(suggestions).filter(key => !dismissedTypoSuggestions.has(key));
    const hasUnacknowledgedTypos = unacknowledgedTypos.length > 0;

    // If there are any validation errors OR unacknowledged typo suggestions, block progression
    if (Object.keys(errors).length > 0 || hasUnacknowledgedTypos) {
      setValidationErrors(errors);

      // Prioritize scrolling to typo suggestions first, then other errors
      if (hasUnacknowledgedTypos) {
        const firstTypoKey = unacknowledgedTypos[0];
        scrollToErrorField(firstTypoKey, true);
      } else if (Object.keys(errors).length > 0) {
        const firstErrorKey = Object.keys(errors)[0];
        scrollToErrorField(firstErrorKey, false);
      }

      return; // Don't proceed to next step
    }

    // If no validation errors, proceed to next step
    const nextStepIndex = Math.min(6, openStep + 1);

    // Auto-center shape when moving to next step
    const centeredPoints = centerShape(config.points);

    setConfig(prev => ({ ...prev, step: nextStepIndex }));
    updateConfig({ points: centeredPoints });
    setOpenStep(nextStepIndex);

    setTimeout(() => {
      smoothScrollToStep(nextStepIndex);
    }, 350);
  };

  const prevStep = () => {
    const prevStepIndex = Math.max(0, openStep - 1);

    // Auto-center shape when moving to previous step
    const centeredPoints = centerShape(config.points);

    setConfig(prev => ({ ...prev, step: prevStepIndex }));
    updateConfig({ points: centeredPoints });
    setOpenStep(prevStepIndex);

    setTimeout(() => {
      smoothScrollToStep(prevStepIndex);
    }, 350);
  };

  const toggleStep = (stepIndex: number) => {
    if (stepIndex <= config.step) {
      // Auto-center shape when switching steps
      const centeredPoints = centerShape(config.points);
      updateConfig({ points: centeredPoints });

      const newOpenStep = openStep === stepIndex ? -1 : stepIndex;
      setOpenStep(newOpenStep);

      if (newOpenStep !== -1) {
        setTimeout(() => {
          smoothScrollToStep(newOpenStep);
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
        if (config.fixingPointsInstalled === undefined) return 'Installation status not selected';
        if (!config.fixingHeights || config.fixingHeights.length !== config.corners) return 'Not configured';
        if (!config.fixingTypes || config.fixingTypes.length !== config.corners) return 'Not configured';

        const validHeights = config.fixingHeights.filter(h => h !== undefined && h !== null && h > 0).length;
        const validTypes = config.fixingTypes.filter(t => t === 'post' || t === 'building').length;

        // If fixing points are installed, check eye orientations
        if (config.fixingPointsInstalled === true) {
          if (!config.eyeOrientations || config.eyeOrientations.length !== config.corners) return 'Not configured';
          const validOrientations = config.eyeOrientations.filter(o => o === 'horizontal' || o === 'vertical').length;

          if (validHeights === config.corners && validTypes === config.corners && validOrientations === config.corners) {
            return `${config.corners} anchor points configured`;
          } else {
            return `${Math.min(validHeights, validTypes, validOrientations)}/${config.corners} anchor points configured`;
          }
        } else {
          // If fixing points are not installed, eye orientations are not required
          if (validHeights === config.corners && validTypes === config.corners) {
            return `${config.corners} anchor points configured`;
          } else {
            return `${Math.min(validHeights, validTypes)}/${config.corners} anchor points configured`;
          }
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

  // Check if quote is ready (has price)
  const hasQuote = calculations.totalPrice > 0;

  // Handle save quote
  const handleSaveQuote = () => {
    // Exit lock mode when user interacts
    setIsBarLocked(false);
    setIsNewQuote(false);
    setShowSaveQuoteModal(true);
  };

  // Handle mobile continue button
  const handleMobileContinue = () => {
    if (openStep === 4 && hasQuote) {
      // Exit lock mode when user interacts
      setIsBarLocked(false);
      setIsNewQuote(false);
      nextStep(); // Move to next step
    }
  };

  if (isLoadingQuote) {
    return (
      <div className="max-w-6xl mx-auto px-2 sm:px-4 lg:px-8 py-16 text-center">
        <div className="animate-spin w-12 h-12 border-4 border-[#BFF102] border-t-[#307C31] rounded-full mx-auto mb-4"></div>
        <p className="text-lg text-slate-700">Loading your saved quote...</p>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto px-2 sm:px-4 lg:px-8 py-8 pb-16">
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
            Design your perfect shade solution and get instant custom pricing with our interactive configurator
          </p>

          {/* Quote Reference Display */}
          {quoteReference && (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#BFF102]/20 border border-[#307C31]/30 rounded-full">
              <svg className="w-5 h-5 text-[#307C31]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-semibold text-[#01312D]">
                Quote: {quoteReference}
              </span>
            </div>
          )}
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
                    dismissTypoSuggestion={dismissTypoSuggestion}
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
                    loading={loading}
                    setLoading={setLoading}
                    setShowLoadingOverlay={setShowLoadingOverlay}
                    onSaveQuote={handleSaveQuote}
                    quoteReference={quoteReference}
                  />
                </AccordionStep>
              );
            })}
          </div>

          {/* Sticky Diagram for Dimensions Step - Desktop Only */}
          {openStep === 4 && !isMobile && (
            <div className="hidden lg:block lg:col-span-2 lg:sticky lg:top-28 lg:self-start z-10">
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
          {(openStep >= 5) && (
            <div className="hidden lg:block lg:col-span-1 lg:sticky lg:top-28 lg:self-start z-10">
              <PriceSummaryDisplay
                config={config}
                calculations={calculations}
                onSaveQuote={handleSaveQuote}
                onGeneratePDF={() => handleGeneratePDFWithSVG(false)}
                isGeneratingPDF={isGeneratingPDF}
                showEmailInput={showEmailInput}
                email={email}
                setEmail={setEmail}
                onEmailSummary={handleEmailSummary}
                onCancelEmailInput={handleCancelEmailInput}
              />
            </div>
          )}

        </div>

        <LoadingOverlay
          isVisible={showLoadingOverlay}
          currentStep={loadingStep.text}
          progress={loadingStep.progress}
        />
      </div>

      {/* Mobile Pricing Bar */}
      <MobilePricingBar
        totalPrice={calculations.totalPrice}
        currency={config.currency}
        isVisible={hasQuote && openStep === 4}
        quoteReference={quoteReference || undefined}
        onContinue={handleMobileContinue}
        onSaveQuote={handleSaveQuote}
        isLocked={isBarLocked}
        isNewQuote={isNewQuote}
      />

      {/* Save Quote Modal */}
      <SaveQuoteModal
        isOpen={showSaveQuoteModal}
        onClose={() => setShowSaveQuoteModal(false)}
        config={config}
        calculations={calculations}
      />
    </>
  );
}