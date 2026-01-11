import React, { useState, useRef, useEffect, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree,useLoader } from '@react-three/fiber';
import { OrbitControls, useGLTF, useProgress, Environment, ContactShadows, Html } from '@react-three/drei';
import * as THREE from 'three';
import styles from '../../styles/VerandaConfigurator.module.css';


// ============================================
// GEMINI AI INTEGRATION
// ============================================

// ============================================
// FIXED GEMINI API INTEGRATION
// Replace your callGeminiAPI function with this version
// ============================================

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

// Check if API key is set
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is not set in environment variables!');
  console.log('Add this to your .env.local file:');
  console.log('NEXT_PUBLIC_GEMINI_API_KEY=your_api_key_here');
}

const SYSTEM_CONTEXT = `You are an expert Dutch veranda configurator assistant. 

CRITICAL RULES:
1. ALWAYS return ONLY valid JSON - no markdown, no backticks, no explanations
2. Use EXACT field names as specified below
3. All measurements in meters (m)
4. Return ALL fields every time

FRAME COLORS (metalMaterial):
- "anthracite" (default, modern, dark grey)
- "black" (bold, contemporary)
- "grey" (neutral, versatile)
- "white" (clean, traditional)

GLASS TYPES (glassType):
- "double" (basic, 2 panels)
- "triple" (standard, 3 panels)
- "fourfold" (premium, 4 panels)
- "fivefold" (luxury, 5 panels)
- "sixfold" (ultimate luxury, 6 panels)

GLASS STYLES (glassStyle):
- "withframe" (framed borders)
- "onlyglass" (frameless, modern)
- "grid" (traditional divided panes)

EXACT JSON FORMAT TO RETURN:
{
  "width": 5.5,
  "depth": 4.5,
  "height": 3.0,
  "metalMaterial": "anthracite",
  "glassType": "triple",
  "glassStyle": "withframe",
  "enclosureEnabled": true,
  "selectedSide": "front",
  "enclosureType": "glass",
  "lightsOn": false,
  "lightShape": "circle",
  "lightColor": "#ffd700",
  "roofPitchActive": false,
  "roofPitchAngle": 0,
  "roofAwningPosition": "none",
  "verandaType": "wall-mounted"
}

NOW ANALYZE THE USER'S REQUEST AND RETURN ONLY THE JSON OBJECT.`;

// ============================================
// HOUSE TYPE SMART DEFAULTS
// ============================================

const HOUSE_TYPE_DEFAULTS = {
  tussenwoning: {
    label: 'Tussenwoning',
    description: 'Row house with neighbors on both sides',
    icon: '🏘️',
    width: 5.0,
    depth: 4.5,
    height: 3.0,
    leftWallOption: 'rabat',      // Solid aluminum
    rightWallOption: 'rabat',     // Solid aluminum
    showLeftFence: true,
    showRightFence: true,
    metalMaterial: 'anthracite',
    enclosureEnabled: true,
    selectedSide: 'front',
    glassType: 'triple'
  },
  hoekwoning: {
    label: 'Hoekwoning',
    description: 'Corner house with one neighbor',
    icon: '🏡',
    width: 5.5,
    depth: 4.5,
    height: 3.0,
    leftWallOption: 'rabat',      // Solid on neighbor side
    rightWallOption: 'glass',     // Glass on open side
    showLeftFence: true,
    showRightFence: false,
    metalMaterial: 'anthracite',
    enclosureEnabled: true,
    selectedSide: 'front',
    glassType: 'fourfold'
  },
  vrijstaand: {
    label: 'Vrijstaand',
    description: 'Detached house with open sides',
    icon: '🏰',
    width: 6.5,
    depth: 5.0,
    height: 3.0,
    leftWallOption: 'glass',      // Glass both sides
    rightWallOption: 'glass',
    showLeftFence: false,
    showRightFence: false,
    metalMaterial: 'black',
    enclosureEnabled: true,
    selectedSide: 'front',
    glassType: 'sixfold'
  }
};

// Side wall option types
const SIDE_WALL_OPTIONS = {
  open: { label: 'Open', price: 0, description: 'No enclosure' },
  glass: { label: 'Glass Wall', price: 1, description: 'Full glass transparency' },
  rabat: { label: 'Aluminum Rabat', price: 1.5, description: 'Privacy & maintenance-free' },
  wood: { label: 'Wood Panel', price: 1.2, description: 'Natural warmth' },
  window: { label: 'Window Wall', price: 1.3, description: 'Glass with frame' }
};
 
async function callGeminiAPI(userText, conversationHistory = []) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'undefined') {
    console.error('❌ Gemini API Key is missing!');
    return {
      success: false,
      error: 'API key not configured.',
      fallbackConfig: getDefaultConfig()
    };
  }

  try {
    const prompt = `${SYSTEM_CONTEXT}

USER REQUEST: "${userText}"

${conversationHistory.length > 0 ? `PREVIOUS CONTEXT: ${JSON.stringify(conversationHistory.slice(-2))}` : ''}

Return ONLY the JSON configuration object.`;

    // UPDATED MODEL: gemini-2.5-flash
    const modelName = 'gemini-2.5-flash';
    
    console.log(`🔄 Calling Gemini API (${modelName})...`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
            responseMimeType: "application/json" // Force JSON response
          }
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      // Log the full error for debugging
      console.error('❌ Gemini API Error:', errorData);
      
      // Check for specific model not found error to give better feedback
      if (response.status === 404) {
        throw new Error(`Model ${modelName} not found. Try checking API documentation for valid model names.`);
      }
      
      throw new Error(errorData?.error?.message || `API Error ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response structure from Gemini');
    }

    let textResponse = data.candidates[0].content.parts[0].text;
    textResponse = textResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const config = JSON.parse(textResponse);
    console.log('✅ Parsed Config:', config);

    // Merge with defaults to ensure all fields exist
    const finalConfig = { ...getDefaultConfig(), ...config };

    return {
      success: true,
      config: finalConfig,
      rawResponse: textResponse
    };

  } catch (error) {
    console.error('❌ Gemini API Processing Error:', error);
    return {
      success: false,
      error: error.message,
      fallbackConfig: getDefaultConfig()
    };
  }
}

// Helper to ensure clean defaults
function getDefaultConfig() {
  return {
    width: 5.5,
    depth: 4.5,
    height: 3.0,
    metalMaterial: 'anthracite',
    glassType: 'triple',
    glassStyle: 'withframe',
    enclosureEnabled: true,
    selectedSide: 'front',
    enclosureType: 'glass',
    lightsOn: false,
    lightShape: 'circle',
    lightColor: '#ffd700',
    roofPitchActive: true,
    roofPitchAngle: 0,
    roofAwningPosition: 'none',
    verandaType: 'wall-mounted'
  };
}
// ============================================
// PRICING SYSTEM
// ============================================

const PRICE_MULTIPLIER = 2.21;

const applyMultiplier = (price) => Math.round(price * PRICE_MULTIPLIER * 100) / 100;

const CapellaPricing = {
  glassPanels: {
    heights: {
      'standard': { clear: 160, tinted: 180 },
      'custom': { clear: 165, tinted: 'custom' }
    }
  },
  rails: {
    '2-track': 80, '3-track': 85, '4-track': 90, '5-track': 95, '6-track': 100
  },
  surcharges: {
    customWork: 60,
    widthOver1200mm: 0.20
  }
};

const CastorPricing = {
  polycarbonateRoof: {
    depths: {
      2000: { 3060: 780, 4060: 920, 5060: 1025, 6060: 1150, 7060: 1300, 8060: 1500, 9060: 1800, 10060: 1950 },
      2500: { 3060: 900, 4060: 1050, 5060: 1250, 6060: 1425, 7060: 1575, 8060: 1700, 9060: 2100, 10060: 2250 },
      3000: { 3060: 1050, 4060: 1225, 5060: 1400, 6060: 1525, 7060: 1700, 8060: 1825, 9060: 2350, 10060: 2600 },
      3500: { 3060: 1225, 4060: 1375, 5060: 1500, 6060: 1700, 7060: 1850, 8060: 2000, 9060: 2450, 10060: 2800 },
      4000: { 3060: 1350, 4060: 1475, 5060: 1650, 6060: 1875, 7060: 2000, 8060: 2150, 9060: 2575, 10060: 2950 },
      5000: { 3060: 1500, 4060: 1850, 5060: 2150, 6060: 2450, 7060: 2850, 8060: 3125, 9060: 3325, 10060: 3650 },
      6000: { 3060: 1850, 4060: 2250, 5060: 2700, 6060: 3100, 7060: 3550, 8060: 3950, 9060: 4250, 10060: 4500 }
    }
  },
  glassRoof: {
    depths: {
      2000: { 3060: 1275, 4060: 1500, 5060: 1700, 6060: 1900, 7060: 2150, 8060: 2350, 9060: 2650, 10060: 2900 },
      2500: { 3060: 1475, 4060: 1675, 5060: 1900, 6060: 2100, 7060: 2375, 8060: 2600, 9060: 3000, 10060: 3250 },
      3000: { 3060: 1650, 4060: 1875, 5060: 2100, 6060: 2300, 7060: 2600, 8060: 2870, 9060: 3300, 10060: 3550 },
      3500: { 3060: 1975, 4060: 2300, 5060: 2575, 6060: 2900, 7060: 3100, 8060: 3450, 9060: 4000, 10060: 4350 },
      4000: { 3060: 2200, 4060: 2580, 5060: 2850, 6060: 3200, 7060: 3500, 8060: 3800, 9060: 4500, 10060: 4900 }
    }
  },
  surcharges: {
    iqRelaxPoly: 10,
    smokyGreyPoly: 12
  }
};

const TitanPricing = {
  polycarbonateRoof: {
    depths: {
      2000: { 3060: 860, 4060: 955, 5060: 1125, 6060: 1295, 7060: 1525, 8060: 1635, 9060: 1945, 10060: 2030 },
      2500: { 3060: 935, 4060: 1065, 5060: 1255, 6060: 1450, 7060: 1610, 8060: 1745, 9060: 2180, 10060: 2295 },
      3000: { 3060: 1015, 4060: 1165, 5060: 1455, 6060: 1575, 7060: 1765, 8060: 1895, 9060: 2385, 10060: 2670 },
      3500: { 3060: 1205, 4060: 1385, 5060: 1560, 6060: 1810, 7060: 1965, 8060: 2090, 9060: 2540, 10060: 2880 },
      4000: { 3060: 1365, 4060: 1570, 5060: 1785, 6060: 1965, 7060: 2090, 8060: 2210, 9060: 2695, 10060: 3150 },
      4500: { 3060: 1620, 4060: 1775, 5060: 1985, 6060: 2300, 7060: 2590, 8060: 2890, 9060: 3095, 10060: 3620 }
    }
  },
  glassRoof: {
    clear: {
      depths: {
        2000: { 3060: 1260, 4060: 1505, 5060: 1755, 6060: 1995, 7060: 2245, 8060: 2460, 9060: 2965, 10060: 3285 },
        2500: { 3060: 1400, 4060: 1655, 5060: 1895, 6060: 2125, 7060: 2365, 8060: 2605, 9060: 3140, 10060: 3410 },
        3000: { 3060: 1630, 4060: 1840, 5060: 2190, 6060: 2350, 7060: 2895, 8060: 3050, 9060: 3400, 10060: 3800 },
        3500: { 3060: 2050, 4060: 2285, 5060: 2660, 6060: 3050, 7060: 3690, 8060: 3900, 9060: 4150, 10060: 4600 },
        4000: { 3060: 2440, 4060: 2675, 5060: 3050, 6060: 3450, 7060: 4060, 8060: 4700, 9060: 5100, 10060: 5280 }
      }
    }
  },
  ledLighting: {
    single: 12,
    sets: { 6: 160, 8: 180, 10: 200, 12: 220, 14: 340, 16: 360, 18: 380 }
  }
};

const SideWallsPricing = {
  zijwandPolycarbonate: {
    2000: 260, 2500: 315, 3000: 335, 3500: 370, 4000: 395, 4500: 465, 5000: 510
  }
};

class PriceCalculator {
  constructor() {
    this.multiplier = PRICE_MULTIPLIER;
  }

  findClosestDimension(dimensions, targetDepth, targetWidth) {
    const depthKeys = Object.keys(dimensions).map(Number).sort((a, b) => a - b);
    const closestDepth = depthKeys.reduce((prev, curr) => 
      Math.abs(curr - targetDepth) < Math.abs(prev - targetDepth) ? curr : prev
    );

    const widthKeys = Object.keys(dimensions[closestDepth]).map(Number).sort((a, b) => a - b);
    const closestWidth = widthKeys.reduce((prev, curr) => 
      Math.abs(curr - targetWidth) < Math.abs(prev - targetWidth) ? curr : prev
    );

    return { depth: closestDepth, width: closestWidth };
  }

  calculateVerandaRoof(config) {
    const {
      model = 'castor',
      roofType = 'polycarbonate',
      depth = 3000,
      width = 4000
    } = config;

    let pricing;
    let basePrice = 0;

    if (model.toLowerCase() === 'castor') {
      pricing = roofType === 'polycarbonate' ? 
        CastorPricing.polycarbonateRoof.depths : 
        CastorPricing.glassRoof.depths;
    } else {
      pricing = roofType === 'polycarbonate' ? 
        TitanPricing.polycarbonateRoof.depths : 
        TitanPricing.glassRoof.clear.depths;
    }

    const coords = this.findClosestDimension(pricing, depth, width);
    basePrice = pricing[coords.depth][coords.width];

    return {
      wholesale: basePrice,
      retail: applyMultiplier(basePrice),
      dimensions: { depth, width, area: (depth / 1000) * (width / 1000) }
    };
  }

  calculateLEDLighting(lightCount) {
    let basePrice;
    
    if (lightCount === 1) {
      basePrice = TitanPricing.ledLighting.single;
    } else if (TitanPricing.ledLighting.sets[lightCount]) {
      basePrice = TitanPricing.ledLighting.sets[lightCount];
    } else {
      return { error: 'Invalid light count' };
    }

    return {
      wholesale: basePrice,
      retail: applyMultiplier(basePrice),
      lightCount
    };
  }

  calculateSideWall(depth) {
    const availableDepths = Object.keys(SideWallsPricing.zijwandPolycarbonate).map(Number);
    const closestDepth = availableDepths.reduce((prev, curr) => 
      Math.abs(curr - depth) < Math.abs(prev - depth) ? curr : prev
    );
    
    const basePrice = SideWallsPricing.zijwandPolycarbonate[closestDepth];
    
    if (!basePrice) {
      return { error: 'Invalid depth' };
    }

    return {
      wholesale: basePrice,
      retail: applyMultiplier(basePrice),
      depth: closestDepth
    };
  }

  calculateCompleteVeranda(config) {
    const {
      model = 'castor',
      depth = 3000,
      width = 4000,
      roofType = 'polycarbonate',
      enclosures = { left: false, right: false },
      lighting = 0
    } = config;

    const results = {
      roof: this.calculateVerandaRoof({ model, roofType, depth, width }),
      enclosures: {},
      lighting: null,
      total: { wholesale: 0, retail: 0 }
    };

    if (enclosures.left) {
      results.enclosures.left = this.calculateSideWall(depth);
    }
    if (enclosures.right) {
      results.enclosures.right = this.calculateSideWall(depth);
    }

    if (lighting > 0) {
      results.lighting = this.calculateLEDLighting(lighting);
    }

    results.total.wholesale = results.roof.wholesale;
    results.total.retail = results.roof.retail;

    Object.values(results.enclosures).forEach(enclosure => {
      if (!enclosure.error) {
        results.total.wholesale += enclosure.wholesale;
        results.total.retail += enclosure.retail;
      }
    });

    if (results.lighting && !results.lighting.error) {
      results.total.wholesale += results.lighting.wholesale;
      results.total.retail += results.lighting.retail;
    }

    return results;
  }
}

// ============================================
// UI COMPONENTS
// ============================================

const LoadingScreen = () => {
  const { progress } = useProgress();
  
  return (
    <div className={styles.loadingScreen}>
      <div className={styles.loadingContent}>
        <svg width="160" height="120" viewBox="0 0 160 120" style={{ marginBottom: '32px' }}>
          <path d="M 20 40 L 80 20 L 140 40 L 140 45 L 20 45 Z" fill="rgba(246, 246, 246, 0.15)" stroke="rgba(246, 246, 246, 0.4)" strokeWidth="2">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite" />
          </path>
          <rect x="30" y="45" width="8" height="55" fill="rgba(246, 246, 246, 0.2)" stroke="rgba(246, 246, 246, 0.5)" strokeWidth="2">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" begin="0.2s" repeatCount="indefinite" />
          </rect>
          <rect x="122" y="45" width="8" height="55" fill="rgba(246, 246, 246, 0.2)" stroke="rgba(246, 246, 246, 0.5)" strokeWidth="2">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" begin="0.4s" repeatCount="indefinite" />
          </rect>
          <rect x="20" y="100" width="120" height="4" fill="rgba(246, 246, 246, 0.25)" stroke="rgba(246, 246, 246, 0.6)" strokeWidth="2">
            <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" begin="0.6s" repeatCount="indefinite" />
          </rect>
          <rect x="45" y="50" width="30" height="45" fill="rgba(61, 51, 111, 0.2)" stroke="rgba(246, 246, 246, 0.3)" strokeWidth="1.5">
            <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2s" begin="0.3s" repeatCount="indefinite" />
          </rect>
          <rect x="85" y="50" width="30" height="45" fill="rgba(61, 51, 111, 0.2)" stroke="rgba(246, 246, 246, 0.3)" strokeWidth="1.5">
            <animate attributeName="opacity" values="0.2;0.6;0.2" dur="2s" begin="0.5s" repeatCount="indefinite" />
          </rect>
        </svg>

        <h1 className={styles.loadingTitle}>CUBESSE</h1>
        
        <div className={styles.loadingProgressBar}>
          <div className={styles.loadingProgressFill} style={{ width: `${progress}%` }} />
        </div>
        
        <p className={styles.loadingText}>Loading Model... {Math.round(progress)}%</p>
      </div>
    </div>
  );
};

const CameraController = ({ enclosureView, verandaType }) => {
  const { camera, gl } = useThree();
  
  // Path progress and camera height
  const pathProgressRef = useRef(0.5); // Start at front-center
  const cameraHeightRef = useRef(0.35); // Initial height
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  
  // Vertical drag accumulator for dead zone
  const verticalDragAccumulator = useRef(0);
  
  // 🆕 ADD: ZOOM CONTROLS
  const zoomDistanceRef = useRef(4.4); // Starting zoom distance
  const lastPinchDistanceRef = useRef(0);
  
  // Camera target (always looking at veranda center)
  const TARGET_POSITION = new THREE.Vector3(0, .5, -.3);
  
  // 🆕 ADD: ZOOM LIMITS
  const MIN_ZOOM = 2.0;  // Closest (inside veranda)
  const MAX_ZOOM = 8.0;  // Farthest (wide view)
  
  // Dead zone threshold (pixels to ignore)
  const VERTICAL_DEAD_ZONE = 15;

  // ============================================
  // 🆕 UPDATED: HEART PATH WITH DYNAMIC ZOOM
  // ============================================
  const getHeartPosition = (progress, height, radius) => {
    const t = progress * Math.PI * 2;
    
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    
    const scale = radius / 19; // 🆕 Use dynamic radius instead of fixed PATH_RADIUS
    
    const position = new THREE.Vector3(
      x * scale * 0.85,
      height,
      y * scale * 0.75
    );
    
    position.z -= 1.35;
    
    return position;
  };

  // ============================================
  // 🆕 ADD: MOUSE WHEEL ZOOM
  // ============================================
  useEffect(() => {
    const handleWheel = (event) => {
      event.preventDefault();
      
      const zoomSpeed = 0.002;
      const delta = event.deltaY;
      
      // Zoom in/out
      zoomDistanceRef.current += delta * zoomSpeed;
      
      // Clamp zoom range
      zoomDistanceRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomDistanceRef.current));
      
      console.log('🔍 Zoom:', zoomDistanceRef.current.toFixed(2) + 'm');
    };

    gl.domElement.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      gl.domElement.removeEventListener('wheel', handleWheel);
    };
  }, [gl]);

  // ============================================
  // 🆕 ADD: PINCH-TO-ZOOM (Mobile)
  // ============================================
  useEffect(() => {
    const handleTouchMove = (event) => {
      if (event.touches.length === 2) {
        event.preventDefault();
        
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        
        const currentDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        
        if (lastPinchDistanceRef.current > 0) {
          const delta = currentDistance - lastPinchDistanceRef.current;
          const pinchSpeed = 0.01;
          
          // Pinch out = zoom in, Pinch in = zoom out
          zoomDistanceRef.current -= delta * pinchSpeed;
          
          // Clamp zoom range
          zoomDistanceRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomDistanceRef.current));
        }
        
        lastPinchDistanceRef.current = currentDistance;
      }
    };

    const handleTouchEnd = () => {
      lastPinchDistanceRef.current = 0;
    };

    gl.domElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    gl.domElement.addEventListener('touchend', handleTouchEnd);
    
    return () => {
      gl.domElement.removeEventListener('touchmove', handleTouchMove);
      gl.domElement.removeEventListener('touchend', handleTouchEnd);
    };
  }, [gl]);

  // ============================================
  // DRAG HANDLERS - WITH VERTICAL DEAD ZONE
  // ============================================
  useEffect(() => {
    const handlePointerDown = (event) => {
      // 🆕 Ignore if pinching (2 fingers)
      if (event.touches && event.touches.length > 1) return;
      
      isDraggingRef.current = true;
      verticalDragAccumulator.current = 0;
      lastMousePosRef.current = {
        x: event.clientX || event.touches?.[0]?.clientX || 0,
        y: event.clientY || event.touches?.[0]?.clientY || 0
      };
    };

    const handlePointerMove = (event) => {
      if (!isDraggingRef.current) return;
      
      // 🆕 Ignore if pinching
      if (event.touches && event.touches.length > 1) return;

      const currentX = event.clientX || event.touches?.[0]?.clientX || 0;
      const currentY = event.clientY || event.touches?.[0]?.clientY || 0;

      const deltaX = currentX - lastMousePosRef.current.x;
      const deltaY = currentY - lastMousePosRef.current.y;

      // ============================================
      // HORIZONTAL DRAG: Move along heart path
      // ============================================
      const screenWidth = window.innerWidth;
      const dragSensitivity = 1 / (screenWidth * 0.57);
      
      pathProgressRef.current += deltaX * dragSensitivity;
      pathProgressRef.current = ((pathProgressRef.current % 1) + 1) % 1;

      // ============================================
      // VERTICAL DRAG: WITH DEAD ZONE THRESHOLD
      // ============================================
      
      // Accumulate vertical movement
      verticalDragAccumulator.current += Math.abs(deltaY);
      
      // Only apply movement if accumulated drag exceeds threshold
      if (verticalDragAccumulator.current >= VERTICAL_DEAD_ZONE) {
        const panSensitivity = 0.0071;
        
        // Apply the actual deltaY (with direction)
        cameraHeightRef.current -= deltaY * panSensitivity;
        
        // Clamp height
        cameraHeightRef.current = Math.max(-0.5, Math.min(3.5, cameraHeightRef.current));
        
        // Reset accumulator after applying movement
        verticalDragAccumulator.current = 0;
      }

      lastMousePosRef.current = { x: currentX, y: currentY };
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      verticalDragAccumulator.current = 0;
    };

    // Add listeners
    gl.domElement.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    gl.domElement.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('touchmove', handlePointerMove);
    window.addEventListener('touchend', handlePointerUp);

    console.log('💝 Heart Path Camera Active');
    console.log('🎮 Drag LEFT/RIGHT to orbit around veranda');
    console.log(`🎮 Drag UP/DOWN to pan (${VERTICAL_DEAD_ZONE}px dead zone)`);
    console.log('🔍 SCROLL WHEEL to zoom in/out'); // 🆕
    console.log('🤏 PINCH to zoom (mobile)');      // 🆕

    return () => {
      gl.domElement.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      gl.domElement.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [gl]);

  // ============================================
  // 🆕 UPDATED: CAMERA UPDATE WITH ZOOM
  // ============================================
  useFrame(() => {
    // Pass current zoom distance to heart path (instead of fixed PATH_RADIUS)
    const newPosition = getHeartPosition(
      pathProgressRef.current, 
      cameraHeightRef.current,
      zoomDistanceRef.current // 🆕 Dynamic zoom radius
    );
    
    camera.position.lerp(newPosition, 0.21);
    camera.lookAt(TARGET_POSITION);
    camera.updateProjectionMatrix();
  });

  // ============================================
  // Quick jump buttons
  // ============================================
  useEffect(() => {
    if (!enclosureView) return;

    let targetProgress;
    let targetHeight = 0.28;

    switch (enclosureView) {
      case 'front':
        targetProgress = 0.5;
        break;
      case 'left':
        targetProgress = 0.25;
        break;
      case 'right':
        targetProgress = 0.75;
        break;
      default:
        targetProgress = 0.5;
    }

    const startProgress = pathProgressRef.current;
    const startHeight = cameraHeightRef.current;
    
    let animProgress = 0;
    const duration = 1000;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      animProgress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - animProgress, 3);

      pathProgressRef.current = startProgress + (targetProgress - startProgress) * easeProgress;
      cameraHeightRef.current = startHeight + (targetHeight - startHeight) * easeProgress;

      if (animProgress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }, [enclosureView]);

  return null;
};
const HeartPathVisualizer = () => {
  const lineRef = useRef();
  
  // Same parameters as CameraController
  const PATH_RADIUS = 3.1;
  const TARGET_POSITION = new THREE.Vector3(0, 0.5, 0);
  
  // Generate heart path points
  const points = useMemo(() => {
    const pathPoints = [];
    const numPoints = 100; // Smooth curve
    
    for (let i = 0; i <= numPoints; i++) {
      const progress = i / numPoints;
      const t = progress * Math.PI * 2;
      
      // Same heart equations as camera
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      
      const scale = PATH_RADIUS / 40;
      
      const position = new THREE.Vector3(
        x * scale * 0.85,
        0.35, // Fixed height for visualization (adjust to see at different heights)
        y * scale * 0.75
      );
      
      // Apply same offset as camera
      position.z -= 1.5;
      
      pathPoints.push(position);
    }
    
    return pathPoints;
  }, []);
  
  return (
    <line ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={points.length}
          array={new Float32Array(points.flatMap(p => [p.x, p.y, p.z]))}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#ff00ff" linewidth={3} />
    </line>
  );
};



const TexturedGround = () => {
  const meshRef = useRef();
  const { camera } = useThree();
  
  // Load textures
  const grassTexture = useLoader(THREE.TextureLoader, '/glass.png');
  const grassNormal = useLoader(THREE.TextureLoader, '/glassnormal.jpg');
  
  // ✅ FIX: Clone textures before modifying
  useEffect(() => {
    if (grassTexture) {
      const clonedTexture = grassTexture.clone();
      clonedTexture.wrapS = clonedTexture.wrapT = THREE.RepeatWrapping;
      clonedTexture.repeat.set(80, 80);
      clonedTexture.needsUpdate = true;
      
      if (meshRef.current) {
        meshRef.current.material.map = clonedTexture;
      }
    }
    if (grassNormal) {
      const clonedNormal = grassNormal.clone();
      clonedNormal.wrapS = clonedNormal.wrapT = THREE.RepeatWrapping;
      clonedNormal.repeat.set(80, 80);
      clonedNormal.needsUpdate = true;
      
      if (meshRef.current) {
        meshRef.current.material.normalMap = clonedNormal;
      }
    }
  }, [grassTexture, grassNormal]);

  useFrame(() => {
    if (meshRef.current) {
      const cameraY = camera.position.y;
      const opacity = THREE.MathUtils.clamp(cameraY / 2, 0, 1);
      meshRef.current.material.opacity = opacity;
    }
  });

  return (
    <mesh 
      ref={meshRef} 
      rotation={[-Math.PI / 2, 0, 0]} 
      position={[0, -0.01, 0]} 
      receiveShadow
    >
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial 
        roughness={0.8}
        metalness={0.1}
        transparent={true}
        opacity={1}
      />
    </mesh>
  );
};


const HouseModel = ({ verandaType, width, depth, height, houseType }) => {
  const { scene: tussenwoningScene } = useGLTF('/Tussenwoning.glb');
  const { scene: hoekwoningScene } = useGLTF('/Hoekwoning.glb');
  const { scene: vrijstaandScene } = useGLTF('/Vrijstaand.glb');
  
  const { camera } = useThree();
  const houseRef = useRef();
  
  const [clonedScenes, setClonedScenes] = useState({
    tussenwoning: null,
    hoekwoning: null,
    vrijstaand: null
  });
  
  const fencesRef = useRef({
    fence: null,
    fence2: null,
    fence3: null,
  });
const leavesRef = useRef({
  tussenwoning: [],
  hoekwoning: [],
  vrijstaand: []
});
const vegetationRef = useRef({
  pavel: [],
  bush: []
});
  // ✅ FIX: Remove clonedScenes from dependency array
useEffect(() => {
  const newScenes = {};
  let hasChanges = false;

  if (tussenwoningScene && !clonedScenes.tussenwoning) {
    newScenes.tussenwoning = tussenwoningScene.clone();
    hasChanges = true;
    
    leavesRef.current.tussenwoning = [];
    
    newScenes.tussenwoning.traverse((child) => {
      child.visible = true;
      const childNameLower = child.name.toLowerCase();
      
      if (childNameLower === 'fence1') {
        fencesRef.current.fence = child;
        if (child.material) {
          child.material.transparent = true;
          child.material.metalness = 0;
          child.material.roughness = 1;
        }
        child.visible = true;
        console.log('✅ Found fence in Tussenwoning');
      } else if (childNameLower === 'fence2') {
        fencesRef.current.fence2 = child;
        if (child.material) {
          child.material.transparent = true;
          child.material.metalness = 0;
          child.material.roughness = 1;
        }
        child.visible = true;
        console.log('✅ Found fence2 in Tussenwoning');
      }
      
      // Pavel and bush objects
      if (child.name && (child.name.toLowerCase().includes('pavel') || child.name.toLowerCase().includes('bush'))) {
        console.log('✅ Found vegetation in Tussenwoning:', child.name);
        vegetationRef.current.pavel.push(child);
      }
      
      // Leaves object
      if (child.name === 'll') {
        console.log('✅ Found ll (leaves) in Tussenwoning:', child);
        if (child.material) {
          child.material.transparent = true;
        }
        leavesRef.current.tussenwoning.push(child);
      }
    });
    console.log('✅ Loaded Tussenwoning.glb');
    console.log('📦 Total leaves (ll) found:', leavesRef.current.tussenwoning.length);
  }

  if (hoekwoningScene && !clonedScenes.hoekwoning) {
    newScenes.hoekwoning = hoekwoningScene.clone();
    hasChanges = true;
    
    leavesRef.current.hoekwoning = [];
    
    newScenes.hoekwoning.traverse((child) => {
      child.visible = true;
      const childNameLower = child.name.toLowerCase();
      
      if (childNameLower === 'fence3') {
        fencesRef.current.fence3 = child;
        if (child.material) {
          child.material.transparent = true;
          child.material.metalness = 0;
          child.material.roughness = 1;
        }
        child.visible = true;
        console.log('✅ Found fence3 in Hoekwoning');
      }
      
      // Pavel and bush objects
      if (child.name && (child.name.toLowerCase().includes('pavel') || child.name.toLowerCase().includes('bush'))) {
        console.log('✅ Found vegetation in Hoekwoning:', child.name);
        vegetationRef.current.pavel.push(child);
      }

      // Leaves objects
      if (child.name && child.name.toLowerCase().includes('leaves')) {
        console.log('✅ Found leaves in Hoekwoning:', child.name);
        if (child.material) {
          child.material.transparent = true;
        }
        leavesRef.current.hoekwoning.push(child);
      }
    });
    console.log('✅ Loaded Hoekwoning.glb');
    console.log('📦 Total leaves found:', leavesRef.current.hoekwoning.length);
  }

  if (vrijstaandScene && !clonedScenes.vrijstaand) {
    newScenes.vrijstaand = vrijstaandScene.clone();
    hasChanges = true;
    
    leavesRef.current.vrijstaand = [];
    
    newScenes.vrijstaand.traverse((child) => {
      child.visible = true;
      
      // Leaves objects
      if (child.name && child.name.toLowerCase().includes('leaves')) {
        console.log('✅ Found leaves in Vrijstaand:', child.name);
        if (child.material) {
          child.material.transparent = true;
        }
        leavesRef.current.vrijstaand.push(child);
      }
      
      // ✅ FIXED: Moved INSIDE traverse loop
      if (child.name && (child.name.toLowerCase().includes('pavel') || child.name.toLowerCase().includes('bush'))) {
        console.log('✅ Found vegetation in Vrijstaand:', child.name);
        vegetationRef.current.pavel.push(child);
      }
    });
    
    console.log('✅ Loaded Vrijstaand.glb');
    console.log('📦 Total leaves found:', leavesRef.current.vrijstaand.length);
  }

  if (hasChanges) {
    setClonedScenes(prev => ({ ...prev, ...newScenes }));
  }
}, [tussenwoningScene, hoekwoningScene, vrijstaandScene]);// ✅ REMOVED clonedScenes

  // STEP 2: Position the active house
  useEffect(() => {
    const activeScene = clonedScenes[houseType];
    if (!activeScene) return;

    const depthScale = depth / 3;
    
    if (verandaType === 'wall-mounted') {
      const depthDifference = depth - 3;
      activeScene.position.set(0, 0, depthDifference / 6);
    } else {
      activeScene.position.set(0, 0, 1.5 * depthScale);
    }
    
    console.log(`📍 Positioned ${houseType} house at:`, activeScene.position);
  }, [houseType, verandaType, depth, height, clonedScenes]);

  // STEP 3: Camera-based fence fading
// STEP 3: Camera-based fence fading
// STEP 3: Camera-based fence fading and leaf visibility
// STEP 3: Camera-based fence fading and leaf visibility
// STEP 3: Camera-based visibility - INSTANT HIDING (preserving leaf alpha)
useFrame(() => {
  if (!camera || !houseRef.current) return;

  const cameraPos = camera.position;
  const angle = Math.atan2(cameraPos.x, cameraPos.z);
  const normalizedAngle = ((angle * (180 / Math.PI) + 360) % 360);

  const distance = Math.sqrt(cameraPos.x * cameraPos.x + cameraPos.z * cameraPos.z);
  const elevationRad = Math.atan2(cameraPos.y, distance);
  const elevationDeg = elevationRad * (180 / Math.PI);

  // ============================================
  // INSTANT HIDING: Only when camera goes BEHIND house
  // ============================================
  
  // Calculate house Z-position
  const depthScale = depth / 3;
  
  let houseZ;
  if (verandaType === 'wall-mounted') {
    const depthDifference = depth - 3;
    houseZ = depthDifference / 6;
  } else {
    houseZ = 1.5 * depthScale;
  }
  
  // Hide house ONLY if camera is BEHIND it
  const isBehindHouse = cameraPos.z > houseZ + 1.0;
  const isCloseEnoughHorizontally = Math.abs(cameraPos.x) < 8.0;
  
  const shouldHideHouse = isBehindHouse && isCloseEnoughHorizontally;
  
  // 🆕 FIXED: Collect all leaf objects from all house types
  const allLeaves = [
    ...leavesRef.current.tussenwoning,
    ...leavesRef.current.hoekwoning,
    ...leavesRef.current.vrijstaand
  ];
  
  // INSTANT HIDE/SHOW
  if (shouldHideHouse) {
    houseRef.current.visible = false;
  } else {
    houseRef.current.visible = true;
    
    // 🆕 FIXED: Reset opacity BUT preserve leaf transparency
    houseRef.current.traverse((child) => {
      if (child.material) {
        // ✅ Check if this child is a leaf object
        const isLeaf = allLeaves.includes(child);
        
        if (isLeaf) {
          // Preserve leaf transparency
          child.material.transparent = true;
          // Don't change opacity for leaves
        } else {
          // Reset normal objects to opaque
          child.material.transparent = false;
          child.material.opacity = 1.0;
        }
      }
    });
  }

  // ============================================
  // Rest of visibility logic (fences, leaves)
  // ============================================
  const isInVisibleRange = (normalizedAngle >= 160 && normalizedAngle <= 200);

  if (houseType === 'tussenwoning') {
    if (fencesRef.current.fence) {
      fencesRef.current.fence.visible = isInVisibleRange;
    }
    if (fencesRef.current.fence2) {
      fencesRef.current.fence2.visible = isInVisibleRange;
    }
    leavesRef.current.tussenwoning.forEach(leafObject => {
      if (leafObject) {
        leafObject.visible = isInVisibleRange;
      }
    });
  }
  else if (houseType === 'hoekwoning') {
    if (fencesRef.current.fence3) {
      fencesRef.current.fence3.visible = isInVisibleRange;
    }
    leavesRef.current.hoekwoning.forEach(leafObject => {
      if (leafObject) {
        leafObject.visible = isInVisibleRange;
      }
    });
  }
  else if (houseType === 'vrijstaand') {
    leavesRef.current.vrijstaand.forEach(leafObject => {
      if (leafObject) {
        leafObject.visible = isInVisibleRange;
      }
    });
  }

  // Vegetation visibility
  vegetationRef.current.pavel.forEach(vegObject => {
    if (vegObject) {
      vegObject.visible = elevationDeg >= 0;
    }
  });
});
  const activeScene = clonedScenes[houseType];
  
  if (!activeScene) return null;

  return <primitive ref={houseRef} object={activeScene} key={houseType} />;
};
// ============================================
// GLASS TINT COLORS
// ============================================
const GLASS_TINT_COLORS = {
  clear: {
    label: 'Clear',
    color: '#ffffff',
    opacity: 0.3,
    description: 'No tint'
  },
  lightgrey: {
    label: 'Light Grey',
    color: '#b0b0b0',
    opacity: 0.4,
    description: 'Subtle grey tint'
  },
  smokegrey: {
    label: 'Smoke Grey',
    color: '#707070',
    opacity: 0.5,
    description: 'Dark smoke effect'
  },
  bronze: {
    label: 'Bronze',
    color: '#cd7f32',
    opacity: 0.45,
    description: 'Warm bronze tone'
  },
  green: {
    label: 'Green',
    color: '#90c090',
    opacity: 0.4,
    description: 'Subtle green tint'
  },
  blue: {
    label: 'Blue',
    color: '#a0c0e0',
    opacity: 0.4,
    description: 'Light blue tint'
  }
};

const VerandaModel = ({ 
  roofPitchActive,
  roofPitchAngle,
  roofAwningPosition,
  metalMaterial,
  enclosureType,
  enclosureEnabled,
  selectedSide,
  lightsOn,
  lightShape,
  timeOfDay,
  lightColor,
  glassType,
  glassStyle,
  width,
  depth,
  height,
  sideEnclosureTypes,
  verandaType,
  tintedGlassEnabled,
  glassColor
}) => {
  const { scene } = useGLTF('/ver.glb');
  const modelRef = useRef();
  const pointLightRef = useRef();
  const floorRef = useRef();
useEffect(() => {
  if (!scene) return;

  // ============================================
  // STEP 1: DEFINE ALL CONSTANTS FIRST
  // ============================================

  const roofXScales = {
    double: 1.0,
    triple: 1.005,
    fourfold: 1.01,
    fivefold: 1.02,
    sixfold: 1.03
  };
  const currentRoofScaleX = roofXScales[glassType] || 1.0;

const visibleAtStart = [
    'normroofholder', 'normroofglass', 'normroof',  // ✅ REMOVED backglass and back elements
    'floor',
     'oneglassright', 'oneglassleft',
    'twoglassholder', 'twoglassholderbottom','normroofholder ',
    'leftpillar', 'rightpillar',  // ✅ REMOVED back pillars
    'borderglassleft', 'borderglassright',  // ✅ REMOVED backglassholder
    'lightsround', 'doubleglasssliderleft', 'doubleglasssliderright'
  ];

  const alwaysVisibleStructural = [];

const glassConfigs = {
  double: {
    borders: ['borderglassleft', 'borderglassright'],
    holders: ['twoglassholder', 'twoglassholderbottom'],
    glasses: ['oneglassleft', 'oneglassright'],
    sliders: ['doubleglasssliderleft', 'doubleglasssliderright'],
    singleGlasses: ['oneglassleft', 'oneglassright'],
    grid: 'griddouble',
    pillarScale: { x: 1.0, y: 1.0, z: 1.0 },
    // 🆕 ADD: Left/Right specific glass names
    leftGlasses: ['doubleglasssliderleft'],
    rightGlasses: ['doubleglasssliderright']
  },
  triple: {
    borders: ['borderglasslefttriple', 'borderglassmidtriple', 'borderglassrighttriple'],
    holders: ['tripleglassholder', 'tripleglassholderbottom'],
    glasses: ['tripleleftglass', 'triplemidglass', 'triplerightglass'],
    sliders: ['tripleglasssliderleft', 'tripleglassslidermid', 'tripleglasssliderright'],
    grid: 'gridtriple',
    pillarScale: { x: 1.4, y: 1.4, z: 1.4 },
  
  },
  fourfold: {
    borders: ['borderglassfourleft', 'borderglassfoursecond', 'borderglassfourthird', 'borderglassfourright'],
    holders: ['fourglassholder', 'fourglassholderbottom'],
    glasses: ['fourfirstglass', 'foursecondglass', 'fourthirdglass', 'fourlastglass'],
    sliders: ['glasssliderfourleft', 'glasssliderfoursecond', 'glasssliderfourthird', 'glasssliderfourright'],
    grid: 'gridfourfold',
    pillarScale: { x: 1.6, y: 1.6, z: 1.6 },
    // 🆕 ADD: Based on your screenshots
    leftGlasses: ['borderglassfourleft', 'borderglassfoursecond', 'borderglassfourthird', 'borderglassfourright'],
    rightGlasses: ['borderglassfourleft', 'borderglassfoursecond', 'borderglassfourthird', 'borderglassfourright']
  },
  fivefold: {
    borders: ['borderglassfiveleft', 'borderglassfivesecond', 'borderglassfivethird', 'borderglassfivefourth', 'borderglassfiveright'],
    holders: ['fiveglassholder', 'fiveglassholderbottom'],
    glasses: ['fivefirstglass', 'fivesecondglass', 'fivethirdglass', 'fivefourthglass', 'fivelastglass'],
    sliders: ['glasssliderfiveleft', 'glasssliderfivesecond', 'glasssliderfivethird', 'glasssliderfivefour', 'glasssliderfiveright'],
    grid: 'gridfivefold',
    pillarScale: { x: 1.85, y: 1.85, z: 1.85 },
    // 🆕 ADD: Based on your screenshots
    leftGlasses: ['borderglassfiveleft', 'borderglassfivesecond', 'borderglassfivethird', 'borderglassfivefourth', 'fivefirstglass'],
    rightGlasses: ['borderglassfivefourth', 'borderglassfiveright', 'fivefourthglass', 'fivelastglass']
  },
  sixfold: {
    borders: ['borderglasssixleft', 'borderglasssixsecond', 'borderglasssixthird', 'borderglasssixfourth', 'borderglasssixfifth', 'borderglasssixright'],
    holders: ['sixglassholder', 'sixglassholderbottom'],
    glasses: ['sixfirstglass', 'sixsecondglass', 'sixthirdglass', 'sixfourthglass', 'sixfifthglass', 'sixlastglass'],
    sliders: ['glasslidersixleft', 'glassslidersixsecond', 'glasslidersixthird', 'glasslidersixfour', 'glasslidersixfifth', 'glasslidersixright'],
    grid: 'gridsixfold',
    pillarScale: { x: 2.2, y: 2.1, z: 2.1 },
    // 🆕 ADD: Based on your screenshots
    leftGlasses: ['borderglasssixleft', 'borderglasssixsecond', 'borderglasssixthird', 'sixfirstglass', 'sixsecondglass'],
    rightGlasses: ['borderglasssixfourth', 'borderglasssixfifth', 'borderglasssixright', 'sixfourthglass', 'sixfifthglass', 'sixlastglass']
  }
};

  const currentGlassConfig = glassConfigs[glassType] || glassConfigs.double;

  const getFrameColor = () => {
    switch(metalMaterial) {
      case 'anthracite': return '#28282d';
      case 'black': return '#000000';
      case 'grey': return '#808080';
      case 'white': return '#f5f5f5';
      default: return '#28282d';
    }
  };

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: getFrameColor(),
    metalness: 0.8,
    roughness: 0.2
  });

  // ============================================
// GLASS MATERIAL WITH TINT
// ============================================
const getGlassMaterial = () => {
  const tintConfig = GLASS_TINT_COLORS[glassColor] || GLASS_TINT_COLORS.clear;
  
  if (!tintedGlassEnabled || glassColor === 'clear') {
    // Standard clear glass
    return new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 0,
      roughness: 0.1,
      transmission: 0.95,
      transparent: true,
      opacity: 0.3,
      ior: 1.5
    });
  } else {
    // Tinted glass
    return new THREE.MeshPhysicalMaterial({
      color: tintConfig.color,
      metalness: 0,
      roughness: 0.1,
      transmission: 0.85,
      transparent: true,
      opacity: tintConfig.opacity,
      ior: 1.5
    });
  }
};

const glassMaterial = getGlassMaterial();

  const lightEmissiveColor = timeOfDay === 'night' ? lightColor : '#000000';
  const lightIntensity = timeOfDay === 'night' ? 1.5 : 0;

  const lightMaterial = new THREE.MeshStandardMaterial({
    color: lightsOn ? (metalMaterial === 'anthracite' ? '#f5f5f5' : '#28282d') : '#333333',
    emissive: lightsOn ? lightEmissiveColor : '#000000',
    emissiveIntensity: lightsOn ? lightIntensity : 0,
    transparent: true,
    opacity: lightsOn ? 1 : 0.3
  });

  const allGlassObjects = [];
  Object.entries(glassConfigs).forEach(([type, config]) => {
    if (type !== 'double') {
      allGlassObjects.push(
        ...config.borders,
        ...config.holders,
        ...config.glasses,
        ...config.sliders,
        config.grid
      );
    }
  });

  const widthScale = width / 3;
  const depthScale = depth / 3;
  const heightScale = height / 3;

  const noDepthScaleObjects = [
    'twoglassholder', 'twoglassholderbottom',
    'tripleglassholder', 'tripleglassholderbottom',
    'fourglassholder', 'fourglassholderbottom',
    'fiveglassholder', 'fiveglassholderbottom',
    'sixglassholder', 'sixglassholderbottom'
  ];

  // ============================================
  // STEP 2: SCALE THE MODEL
  // ============================================
  
  if (modelRef.current) {
    modelRef.current.scale.set(widthScale, heightScale, depthScale);
  }

  // ============================================
  // STEP 3: UNBIND Material.006
  // ============================================
  
  const initialBlackMaterial = new THREE.MeshStandardMaterial({
    color: '#000000ff',
    metalness: 0.8,
    roughness: 0.2
  });

  scene.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    
    if (child.material.name === 'Material.006') {
      child.material = initialBlackMaterial.clone();
    }
  });

  // ============================================
  // STEP 4: MAIN VISIBILITY LOGIC
  // ============================================
  
  scene.traverse((child) => {
    if (!child.isMesh) return;
    
    const childNameLower = child.name.toLowerCase();

    // Enable shadows
    child.castShadow = true;
    child.receiveShadow = true;

    // ============================================
    // A. WALL-MOUNTED vs FREESTANDING LOGIC
    // ============================================
    if (childNameLower === 'floor') {
      floorRef.current = child;
      if (child.material) {
        child.material.transparent = true;
        child.material.opacity = 1.0;
        child.material.needsUpdate = true;
     
      }
      console.log('✅ Found floor object with wood texture');
    }
// ============================================
// A. WALL-MOUNTED vs FREESTANDING LOGIC
// ============================================

// ============================================
// A. WALL-MOUNTED vs FREESTANDING LOGIC
// ============================================

// ============================================
// A. WALL-MOUNTED vs FREESTANDING LOGIC
// ============================================
 if (childNameLower === 'floor') {
    floorRef.current = child;
    console.log('✅ Found floor object');
  }
if (verandaType === 'wall-mounted') {
  // WALL-MOUNTED: Hide back elements
  const wallMountedHiddenObjects = [
    'leftbackpiller', 
    'rightbackpiller', 
    'righbackpiller',
    'backglass', 
    'backholder'
  ];
  
  if (wallMountedHiddenObjects.includes(childNameLower)) {
    child.visible = false;
  }
  
  // Wall-mounted ALWAYS uses pitchnormroof (never normroof)
  if (childNameLower === 'normroof') {
    child.visible = false;
  }
  
  // Show pitchnormroof for wall-mounted
  if (childNameLower === 'pitchnormroof') {
    child.visible = true;
  }
} 
else if (verandaType === 'freestanding') {
  // FREESTANDING: Show back elements EXPLICITLY
  const freestandingVisibleObjects = [
    'leftbackpiller', 
    'rightbackpiller', 
    'righbackpiller',
    'backglass',        // ✅ Make sure this is here
    'backholder'   // ✅ Make sure this is here
  ];
  
  // ✅ FORCE VISIBILITY for freestanding back elements
  if (freestandingVisibleObjects.includes(childNameLower)) {
    child.visible = true;
  }
  
  // Freestanding uses normroof (not pitchnormroof)
  if (childNameLower === 'normroof') {
    child.visible = true;
  }
  
  // Hide pitchnormroof for freestanding
  if (childNameLower === 'pitchnormroof') {
    child.visible = false;
  }
}
    // ============================================
    // B. PILLAR SCALING
    // ============================================
    
    if (childNameLower === 'leftpillar' || childNameLower === 'rightpillar') {
      child.scale.x = currentGlassConfig.pillarScale.x;
    }

    // ============================================
    // C. STRUCTURAL PILLARS (always visible)
    // ============================================
    
   const frontPillarNames = ['leftpiller', 'rightpiller'];


// Front pillars are ALWAYS visible
if (frontPillarNames.includes(childNameLower)) {
  child.visible = true;
}

// Back pillars visibility depends on verandaType (handled in section A)
// Don't force them visible here - let section A control them


    // ============================================
    // D. INITIAL VISIBILITY SETUP
    // ============================================
    
  const isNonDoubleGlassObject = allGlassObjects.some(obj => childNameLower === obj.toLowerCase());

if (isNonDoubleGlassObject) {
  child.visible = false;
} else {
  // ✅ Special handling for freestanding back elements
  const freestandingBackElements = ['backglass', 'backholder', 'leftbackpiller', 'rightbackpiller', 'righbackpiller'];
  
  if (verandaType === 'freestanding' && freestandingBackElements.includes(childNameLower)) {
    child.visible = true; // Force visible for freestanding
  } else {
    child.visible = visibleAtStart.some(obj => childNameLower === obj.toLowerCase());
  }
}

    // ============================================
    // E. ALWAYS VISIBLE STRUCTURAL ELEMENTS
    // ============================================
    
    if (alwaysVisibleStructural.includes(childNameLower)) {
      child.visible = true;
    }

    // ============================================
    // F. LEFT SIDE ENCLOSURES
    // ============================================
    
  // ============================================
// F. LEFT SIDE ENCLOSURES
// ============================================

if (enclosureEnabled) {
  // ❌ REMOVED: 'leftglass', 'leftholder' (now handled by .001 objects)
  const leftMetalParts = ['metalleft', 'metalholderleft'];
  const leftWoodParts = ['woodleft', 'woodholderleft'];
  const leftWindowParts = ['windowwallleft', 'windowleftone', 'windowlefttwo', 'windowleftholder2', 'windowleftholder'];
  
  const leftEnclosureType = sideEnclosureTypes?.left?.material || 'glass';
  
  // Hide all left enclosure types (except glass - that's in Section H)
  [...leftMetalParts, ...leftWoodParts, ...leftWindowParts].forEach(part => {
    if (childNameLower === part.toLowerCase()) {
      child.visible = false;
    }
  });
  
  // Show selected type based on material
  if (leftEnclosureType === 'metal') {
    if (leftMetalParts.some(p => childNameLower === p.toLowerCase())) {
      child.visible = true;
    }
  } else if (leftEnclosureType === 'wood') {
    if (leftWoodParts.some(p => childNameLower === p.toLowerCase())) {
      child.visible = true;
    }
  } else if (leftEnclosureType === 'window') {
    if (leftWindowParts.some(p => childNameLower === p.toLowerCase())) {
      child.visible = true;
    }
  }
  // ✅ Glass is handled in Section H with .001 objects (dynamic glass types)
}

    // ============================================
    // G. RIGHT SIDE ENCLOSURES
    // ============================================
// ============================================
// G. RIGHT SIDE ENCLOSURES
// ============================================
if (enclosureEnabled) {
  // ❌ REMOVED: 'rightglass', 'rightholder' (now handled by .002 objects)
  const rightMetalParts = ['metalright', 'metalholderright'];
  const rightWoodParts = ['woodright', 'woodholderright'];
  const rightWindowParts = ['windowwallright', 'windowrightone', 'windowrighttwo', 'windowrightholder2', 'windowrightholder'];
  
  const rightEnclosureType = sideEnclosureTypes?.right?.material || 'glass';
  
  // Hide all right enclosure types (except glass - that's in Section H)
  [...rightMetalParts, ...rightWoodParts, ...rightWindowParts].forEach(part => {
    if (childNameLower === part.toLowerCase()) {
      child.visible = false;
    }
  });
  
  // Show selected type based on material
  if (rightEnclosureType === 'metal') {
    if (rightMetalParts.some(p => childNameLower === p.toLowerCase())) {
      child.visible = true;
    }
  } else if (rightEnclosureType === 'wood') {
    if (rightWoodParts.some(p => childNameLower === p.toLowerCase())) {
      child.visible = true;
    }
  } else if (rightEnclosureType === 'window') {
    if (rightWindowParts.some(p => childNameLower === p.toLowerCase())) {
      child.visible = true;
    }
  }
  // ✅ Glass is handled in Section H with .002 objects (dynamic glass types)
}
    // ============================================
    // H. FRONT GLASS CONFIGURATION
    // ============================================
    
  // ============================================
// H. GLASS CONFIGURATION (ALL SIDES)
// ============================================

// ============================================
// H. GLASS CONFIGURATION (ALL SIDES) - FIXED
// ============================================
// ============================================
// H. GLASS CONFIGURATION (UNIFIED SYSTEM)
// ============================================
// ============================================
// FIXED GLASS CONFIGURATION LOGIC - Section H
// Replace the entire Section H in your useEffect
// ============================================

// ============================================
// H. GLASS CONFIGURATION (UNIFIED SYSTEM) - FIXED
// ============================================

// ============================================
// H. GLASS CONFIGURATION (UNIFIED SYSTEM) - FIXED
// ============================================
// ============================================
// H. GLASS CONFIGURATION (STRICT SUFFIX LOGIC)
// ============================================

if (enclosureEnabled) {
  // 1. Get the glass type & material for each specific side
  const frontGlassType = sideEnclosureTypes.front?.glassType || glassType;
  const leftGlassType = sideEnclosureTypes.left?.glassType || glassType;
  const rightGlassType = sideEnclosureTypes.right?.glassType || glassType;

  const frontConfig = glassConfigs[frontGlassType];
  const leftConfig = glassConfigs[leftGlassType];   
  const rightConfig = glassConfigs[rightGlassType]; 

  const frontMaterial = sideEnclosureTypes.front?.material || 'glass';
  const leftMaterial = sideEnclosureTypes.left?.material || 'glass';
  const rightMaterial = sideEnclosureTypes.right?.material || 'glass';
  
  // 2. Identify the object's side based on suffix
  const isLeftObject = child.name.endsWith('001');
  const isRightObject = child.name.endsWith('002');
  const isFrontObject = !isLeftObject && !isRightObject;

  // 3. Get the "Clean Name" (remove suffixes)
  let baseName = childNameLower;
  if (isLeftObject) baseName = childNameLower.replace('001', '');
  if (isRightObject) baseName = childNameLower.replace('002', '');

  // 4. CHECK: Is this object part of ANY glass configuration?
  // We check all configs to ensure we hide it if it's not the currently selected one.
  let isAnyGlassObject = false;

  Object.values(glassConfigs).forEach((config) => {
    const allParts = [
      ...config.borders,
      ...config.holders,
      ...config.glasses,
      ...config.sliders,
      config.grid
    ];
    if (config.singleGlasses) allParts.push(...config.singleGlasses);

    if (allParts.some(part => baseName === part.toLowerCase())) {
      isAnyGlassObject = true;
    }
  });

  // If it's a glass system object, we control its visibility here
  if (isAnyGlassObject) {
    // Default to hidden
    child.visible = false; 

    // Determine the TARGET config for this specific object's side
    let targetConfig = null;
    let targetMaterial = null;

    if (isFrontObject) {
      targetConfig = frontConfig;
      targetMaterial = frontMaterial;
    } else if (isLeftObject) {
      targetConfig = leftConfig;
      targetMaterial = leftMaterial;
    } else if (isRightObject) {
      targetConfig = rightConfig;
      targetMaterial = rightMaterial;
    }

    // Only proceed if this side is set to 'glass'
    if (targetConfig && targetMaterial === 'glass') {
      
      // Check if this object exists in the TARGET config
      const isHolder = targetConfig.holders.some(h => baseName === h.toLowerCase());
      const isPanel = targetConfig.glasses.some(g => baseName === g.toLowerCase());
      const isBorder = targetConfig.borders.some(b => baseName === b.toLowerCase());
      const isSlider = targetConfig.sliders.some(s => baseName === s.toLowerCase());
      const isSingle = targetConfig.singleGlasses && targetConfig.singleGlasses.some(sg => baseName === sg.toLowerCase());
      const isGrid = baseName === targetConfig.grid.toLowerCase();

      // If it belongs to the active config, SHOW IT
      if (isHolder || isPanel || isBorder || isSlider || isSingle || isGrid) {
        
        // Visibility Logic
        if (isHolder || isSlider) child.visible = true;
        
        if (isPanel || isSingle) {
          child.visible = true;
          if (child.material) child.material = glassMaterial.clone();
        }

        if (isBorder) {
          child.visible = (glassStyle === 'withframe' || glassStyle === 'grid');
        }

        if (isGrid) {
          child.visible = (glassStyle === 'grid');
        }
      }
    }
  }

} else {
  // Enclosure disabled - show default double glass frames only on Front if needed
  // Or hide everything if you want total open air.
  // Assuming default behavior is kept for 'double' elements if Enclosure is OFF:
  const doubleGlassObjects = [
    ...glassConfigs.double.holders,
    ...glassConfigs.double.glasses
  ];
  
  if (doubleGlassObjects.some(obj => childNameLower === obj.toLowerCase())) {
    child.visible = true; 
  }
}
    // ============================================
    // I. ROOF PITCH LOGIC
    // ============================================
    
   // ============================================
// I. ROOF PITCH LOGIC
// ============================================

// ============================================
// I. ROOF PITCH LOGIC
// ============================================
// ============================================
// I. ROOF PITCH LOGIC
// ============================================

if (roofPitchActive) {
  // PITCHED ROOF ACTIVE - Hide flat roof elements (EXCEPT normroofholder)
  
  // Hide flat roof elements (but keep normroofholder visible)
  if (['normroof', 'normroofglass', 'pitchnormroof'].includes(childNameLower)) {
    child.visible = false;
  }
  
  // Hide flat roof lights
  if (['lightsround', 'lightsrect', 'lightssquare'].includes(childNameLower)) {
    child.visible = false;
  }
  
  // Show pitched roof elements
  if (['roofpitchbase', 'roofpitchside', 'roofpitchglass', 'roofpitchshade'].includes(childNameLower)) {
    child.visible = true;
  }

  const angleRad = -THREE.MathUtils.degToRad(roofPitchAngle);
  
  if (childNameLower === 'roofpitchglass') {
    child.scale.y = 1 + (roofPitchAngle / 15) * 2.5;
    child.visible = true;
  }
  
  if (childNameLower === 'roofpitchside') {
    child.rotation.x = angleRad;
    child.scale.z = 1 + (roofPitchAngle / 15) * 0.1;
  }
  
  if (childNameLower === 'roofpitchshade') {
    child.rotation.x = angleRad;
  }
} else {
  // FLAT ROOF MODE - Show normroofglass and appropriate roof
  
  // Hide all pitched elements
  if (['roofpitchbase', 'roofpitchside', 'roofpitchglass', 'roofpitchshade'].includes(childNameLower)) {
    child.visible = false;
  }
  
  // ✅ ALWAYS show normroofglass when pitched roof is disabled
  if (childNameLower === 'normroofglass') {
    child.visible = true;
  }
  
  // Show correct roof based on veranda type
  if (verandaType === 'wall-mounted') {
    // Wall-mounted: show pitchnormroof, hide normroof
    if (childNameLower === 'pitchnormroof') {
      child.visible = true;
    }
    if (childNameLower === 'normroof') {
      child.visible = false;
    }
  } else if (verandaType === 'freestanding') {
    // Freestanding: show normroof, hide pitchnormroof
    if (childNameLower === 'normroof') {
      child.visible = true;
    }
    if (childNameLower === 'pitchnormroof') {
      child.visible = false;
    }
  }
}
    // ============================================
    // J. AWNING LOGIC
    // ============================================
    
   // ============================================
// J. AWNING LOGIC
// ============================================

const angleRad = -THREE.MathUtils.degToRad(roofPitchAngle);

if (roofAwningPosition === 'top') {
  if (roofPitchActive) {
    if (['roofpitchawn', 'roofpitchawnfabric'].includes(childNameLower)) {
      child.visible = true;
      child.rotation.x = angleRad;
      child.scale.z = 1;
      
      // 🆕 STORE ORIGINAL POSITIONS (only once)
      if (child.userData.originalY === undefined) {
        child.userData.originalY = child.position.y;
      }
      if (child.userData.originalZ === undefined) {
        child.userData.originalZ = child.position.z;
      }
      
      // 🆕 ADJUSTABLE OFFSETS
      const BASE_Y_OFFSET = 0.02;    // Lift up by 0.5m (adjust this: 0.3 to 1.0)
      const Z_OFFSET = -0.02;         // Pull forward (negative = forward, adjust: -0.5 to -1.5)
      
      // Calculate movement based on angle
      const upwardMovement = roofPitchAngle * 0.01;
      
      // Apply positions: ORIGINAL + OFFSETS + ANGLE MOVEMENT
      child.position.y = child.userData.originalY + BASE_Y_OFFSET + upwardMovement;
      child.position.z = child.userData.originalZ + Z_OFFSET;
      
      console.log(`📐 Awning: Y=${child.position.y.toFixed(2)}m (base+${BASE_Y_OFFSET}+${upwardMovement.toFixed(2)}), Z=${child.position.z.toFixed(2)}m (${Z_OFFSET})`);
    }
    if (['normawn', 'normawnfabric'].includes(childNameLower)) {
      child.visible = false;
    }
  } else {
    // Flat roof mode
    if (['normawn', 'normawnfabric'].includes(childNameLower)) {
      child.visible = true;
      child.scale.z = 1;
      
      // Restore original positions for flat awning
      if (child.userData.originalY === undefined) {
        child.userData.originalY = child.position.y;
      }
      if (child.userData.originalZ === undefined) {
        child.userData.originalZ = child.position.z;
      }
      
      child.position.y = child.userData.originalY;
      child.position.z = child.userData.originalZ;
    }
    if (['roofpitchawn', 'roofpitchawnfabric'].includes(childNameLower)) {
      child.visible = false;
    }
  }
} else {
  // No awning
  if (['normawn', 'normawnfabric', 'roofpitchawn', 'roofpitchawnfabric'].includes(childNameLower)) {
    child.visible = false;
  }
}

    // ============================================
    // K. LIGHTING LOGIC - SINGLE UNIFIED SECTION
    // ============================================
    // ============================================
// K. LIGHTING LOGIC - ONLY FLAT ROOF LIGHTS
// ============================================

const normalLights = ['lightsround', 'lightsrect', 'lightssquare'];

// Hide ALL lights first
normalLights.forEach(lightName => {
  if (childNameLower === lightName.toLowerCase()) {
    child.visible = false;
  }
});

// Show lights ONLY if lightsOn is true AND pitched roof is INACTIVE
if (lightsOn && !roofPitchActive) {
  if (lightShape === 'circle' && childNameLower === 'lightsround') {
    child.visible = true;
    if (child.material) child.material = lightMaterial.clone();
  } 
  else if (lightShape === 'rectangle' && childNameLower === 'lightsrect') {
    child.visible = true;
    if (child.material) child.material = lightMaterial.clone();
  } 
  else if (lightShape === 'square' && childNameLower === 'lightssquare') {
    child.visible = true;
    if (child.material) child.material = lightMaterial.clone();
  }
}

  const roofGlassObjects = ['normroofglass', 'roofpitchglass'];
    
    if (roofGlassObjects.includes(childNameLower)) {
      if (child.material) {
        child.material = glassMaterial.clone();
      }
    }

// ✅ REMOVED: All pitched roof light logic
// Pitched roof lights (roofpitchlightround, roofpitchlightsrect, roofpitchlightssquare) 
// are permanently disabled

    // ============================================
    // L. FRAME COLOR APPLICATION
    // ============================================
    
    const excludedFromFrameColor = [
       'normroofglass', 'backglass', 'woodleft', 'woodright',
      'lightsround', 'lightsrect', 'lightssquare',
      'roofpitchlightround', 'roofpitchlightsrect', 'roofpitchlightssquare',
      , 'roofpitchglass',
      'oneglassleft', 'oneglassright',
      'tripleleftglass', 'triplemidglass', 'triplerightglass',
      'fourfirstglass', 'foursecondglass', 'fourthirdglass', 'fourlastglass',
      'fivefirstglass', 'fivesecondglass', 'fivethirdglass', 'fivefourthglass', 'fivelastglass',
      'sixfirstglass', 'sixsecondglass', 'sixthirdglass', 'sixfourthglass', 'sixfifthglass', 'sixlastglass',
      'doubleglasssliderleft', 'doubleglasssliderright',
      'tripleglasssliderleft', 'tripleglassslidermid', 'tripleglasssliderright',
      'glasssliderfourleft', 'glasssliderfoursecond', 'glasssliderfourthird', 'glasssliderfourright',
      'glasssliderfiveleft', 'glasssliderfivesecond', 'glasssliderfivethird', 'glasssliderfivefour', 'glasssliderfiveright',
      'glassslidersixleft', 'glassslidersixsecond', 'glassslidersixthird', 'glassslidersixfour', 'glassslidersixfifth', 'glassslidersixright',
      'leftglass', 'rightglass',
       'windowleftone', 'windowlefttwo',
       'windowrightone', 'windowrighttwo',
      'normawnfabric', 'roofpitchawnfabric','floor'
    ];
    
 const backElements = ['leftbackpiller', 'rightbackpiller', 'righbackpiller', 'backholder'];

if (backElements.includes(childNameLower) && child.visible && child.material) {
  // Force color application to back elements
  child.material = frameMaterial.clone();
} else {
  // Normal frame color logic for other elements
  const isExcluded = excludedFromFrameColor.some(excluded => childNameLower === excluded.toLowerCase());
  const isGlassObject = childNameLower.includes('glass') && !childNameLower.includes('holder') && !childNameLower.includes('border');
  
  const shouldGetFrameColor = !isExcluded && !isGlassObject;
  
  if (child.visible && shouldGetFrameColor && child.material) {
    child.material = frameMaterial.clone();
  }
}
  });

  // ============================================
  // STEP 5: COUNTER-SCALE GLASS HOLDERS
  // ============================================
  // 🆕 STORE FLOOR AND MAKE MATERIAL TRANSPARENT (preserve texture)

scene.traverse((child) => {
  if (!child.isMesh) return;
  
  const childNameLower = child.name.toLowerCase();
  
  // Remove .001 or .002 suffix to get base name
  let baseName = childNameLower;
  if (childNameLower.endsWith('001')) baseName = childNameLower.slice(0, -3);
  if (childNameLower.endsWith('002')) baseName = childNameLower.slice(0, -3);
  
  // Glass holders that scale WITH depth (proportionally)
  const depthScalingHolders = [
    'twoglassholder', 
    'twoglassholderbottom',
    'tripleglassholder', 
    'tripleglassholderbottom',
    'fourglassholder', 
    'fourglassholderbottom',
    'fiveglassholder', 
    'fiveglassholderbottom',
    'sixglassholder', 
    'sixglassholderbottom'
  ];
  
  if (depthScalingHolders.includes(baseName)) {
    // Scale proportionally with depth
    child.scale.z = depthScale;
    
    // Optional: Log for debugging
    if (depth !== 8.5) { // Only log when depth is non-default
      console.log(`📏 ${child.name} → Z-scale: ${child.scale.z.toFixed(2)}`);
    }
  }
});

  // ============================================
  // STEP 6: ROOF SCALING LOGIC
  // ============================================
  
  scene.traverse((child) => {
    if (!child.isMesh) return;
    
    const childNameLower = child.name.toLowerCase();

    if (childNameLower === 'normroof') {
      child.scale.set(1, 1, currentRoofScaleX); 
    } 
    else if (['normroofglass', 'normroofholder'].includes(childNameLower)) {
      child.scale.set(currentRoofScaleX, 1, 1);
    }
  });

}, [scene, roofPitchActive, roofPitchAngle, roofAwningPosition, metalMaterial, lightsOn, lightShape, timeOfDay, lightColor, enclosureType, glassType, glassStyle, enclosureEnabled, width, depth, height, selectedSide, sideEnclosureTypes, verandaType,tintedGlassEnabled,glassColor]);
useFrame(({ camera }) => {
  if (floorRef.current && floorRef.current.material) {
    const cameraY = camera.position.y;
    
    if (cameraY >= 0) {
      // Above or at ground - fully visible
      floorRef.current.material.transparent = false;
      floorRef.current.material.opacity = 1.0;
    } else {
      // Below ground - fade based on depth
      floorRef.current.material.transparent = true;
      const opacity = Math.max(0, 1 + (cameraY / 0.5)); // Fade from 0 to -0.5m
      floorRef.current.material.opacity = opacity;
    }
    
    if (floorRef.current.material.needsUpdate !== true) {
      floorRef.current.material.needsUpdate = true;
    }
  }
});
if (!scene) return null;

// Calculate light position based on dimensions
const lightHeight = height * 0.18; // 80% of veranda height
const lightDepth = (depth / 4.93) * 0.15; // Center of veranda depth

return (
  <>
    <primitive ref={modelRef} object={scene} />
    
    {/* Dynamic Point Light - only visible when lights are on */}
    {lightsOn && (
      <pointLight
        ref={pointLightRef}
        position={[0, lightHeight, lightDepth]}
        color={lightColor}
        intensity={timeOfDay === 'night' ? 2.5 : 1.2}
        distance={100}
        decay={2}
        castShadow={false}
      />
    )}
    
    {/* Optional: Add a subtle glow sphere for visual effect */}

  </>
);

  
};

// ============================================
// FIXED INTERPRETATION ENGINE - PROPER COLOR & GLASS DETECTION
// Replace your interpretUserInput function with this version
// ============================================

const interpretUserInput = (input, history = []) => {
  const inputLower = input.toLowerCase();
  
  const config = {
    width: 5.5,
    depth: 4.5,
    height: 3,
    roofPitchActive: false,
    roofPitchAngle: 0,
    metalMaterial: 'anthracite',  // Default, but will be overridden
    enclosureEnabled: true,
    enclosureType: 'glass',
    glassType: 'double',  // Changed default from 'triple' to 'double'
    glassStyle: 'withframe',
    selectedSide: 'front',
    lightsOn: false,
    lightShape: 'circle',
    verandaType: 'wall-mounted'
  };

  let reasoning = [];
  let keyFeatures = [];

  // ============================================
  // STEP 1: FRAME COLOR DETECTION - PRIORITY FIX
  // ============================================
  
  // Check for explicit color mentions FIRST
  const colorPatterns = {
    'white': {
      patterns: [/\bwhite\b/gi, /\bwit\b/gi],
      value: 'white'
    },
    'black': {
      patterns: [/\bblack\b/gi, /\bzwart\b/gi],
      value: 'black'
    },
    'grey': {
      patterns: [/\bgrey\b/gi, /\bgray\b/gi, /\bgrijs\b/gi, /\bsilver\b/gi],
      value: 'grey'
    },
    'anthracite': {
      patterns: [/\banthracite\b/gi, /\bантрацит\b/gi, /\bdark.?grey\b/gi, /\bcharcoal\b/gi],
      value: 'anthracite'
    }
  };

  let colorDetected = false;
  for (const [colorName, colorData] of Object.entries(colorPatterns)) {
    for (const pattern of colorData.patterns) {
      if (pattern.test(inputLower)) {
        config.metalMaterial = colorData.value;
        reasoning.push(`Detected ${colorName} frame color`);
        keyFeatures.push(`${colorName} frame`);
        colorDetected = true;
        break;
      }
    }
    if (colorDetected) break;
  }

  // If no color detected, check style-based defaults (lower priority)
  if (!colorDetected) {
    if (/\b(modern|contemporary|sleek|minimalist)\b/.test(inputLower)) {
      config.metalMaterial = 'black';
      reasoning.push('Modern style → black frame');
    } else if (/\b(traditional|classic|timeless)\b/.test(inputLower)) {
      config.metalMaterial = 'white';
      reasoning.push('Traditional style → white frame');
    }
    // Otherwise keeps default 'anthracite'
  }

  // ============================================
  // STEP 2: GLASS TYPE DETECTION - PRIORITY FIX
  // ============================================
  
  const glassPatterns = {
    'sixfold': {
      patterns: [
        /\bsix.?fold\b/gi, 
        /\b6.?fold\b/gi, 
        /\bsix.?panel\b/gi,
        /\b6.?panel\b/gi,
        /\bsix.?glass\b/gi,
        /\b6.?glass\b/gi
      ],
      value: 'sixfold'
    },
    'fivefold': {
      patterns: [
        /\bfive.?fold\b/gi,
        /\b5.?fold\b/gi,
        /\bfive.?panel\b/gi,
        /\b5.?panel\b/gi,
        /\bfive.?glass\b/gi,
        /\b5.?glass\b/gi
      ],
      value: 'fivefold'
    },
    'fourfold': {
      patterns: [
        /\bfour.?fold\b/gi,
        /\b4.?fold\b/gi,
        /\bfour.?panel\b/gi,
        /\b4.?panel\b/gi,
        /\bfour.?glass\b/gi,
        /\b4.?glass\b/gi
      ],
      value: 'fourfold'
    },
    'triple': {
      patterns: [
        /\btriple\b/gi,
        /\bthree.?fold\b/gi,
        /\b3.?fold\b/gi,
        /\bthree.?panel\b/gi,
        /\b3.?panel\b/gi,
        /\btriple.?glass\b/gi,
        /\b3.?glass\b/gi
      ],
      value: 'triple'
    },
    'double': {
      patterns: [
        /\bdouble\b/gi,
        /\btwo.?fold\b/gi,
        /\b2.?fold\b/gi,
        /\btwo.?panel\b/gi,
        /\b2.?panel\b/gi,
        /\bdouble.?glass\b/gi,
        /\b2.?glass\b/gi
      ],
      value: 'double'
    }
  };

// ============================================
// BULLETPROOF GLASS DETECTION - CATCHES EVERYTHING
// Replace the entire STEP 2 section in your interpretUserInput function
// This version is MUCH simpler and catches all variations
// ============================================

// ============================================
// STEP 2: GLASS TYPE DETECTION - BULLETPROOF VERSION
// ============================================

let glassDetected = false;

// SIMPLE APPROACH: Check for each type with multiple patterns
if (/\b(six|6).*(fold|panel|glass|pane)\b/gi.test(inputLower) || 
    (/\bsix\b/gi.test(inputLower) && /\bglass\b/gi.test(inputLower))) {
  config.glassType = 'sixfold';
  config.enclosureEnabled = true;
  config.selectedSide = 'front';
  reasoning.push('Detected sixfold glass configuration');
  keyFeatures.push('sixfold glass');
  glassDetected = true;
} 
else if (/\b(five|5).*(fold|panel|glass|pane)\b/gi.test(inputLower) || 
         (/\bfive\b/gi.test(inputLower) && /\bglass\b/gi.test(inputLower))) {
  config.glassType = 'fivefold';
  config.enclosureEnabled = true;
  config.selectedSide = 'front';
  reasoning.push('Detected fivefold glass configuration');
  keyFeatures.push('fivefold glass');
  glassDetected = true;
} 
else if (/\b(four|4).*(fold|panel|glass|pane)\b/gi.test(inputLower) || 
         (/\bfour\b/gi.test(inputLower) && /\bglass\b/gi.test(inputLower))) {
  config.glassType = 'fourfold';
  config.enclosureEnabled = true;
  config.selectedSide = 'front';
  reasoning.push('Detected fourfold glass configuration');
  keyFeatures.push('fourfold glass');
  glassDetected = true;
} 
else if (/\b(triple|three|3).*(fold|panel|glass|pane)\b/gi.test(inputLower) || 
         (/\b(triple|three)\b/gi.test(inputLower) && /\bglass\b/gi.test(inputLower))) {
  config.glassType = 'triple';
  config.enclosureEnabled = true;
  config.selectedSide = 'front';
  reasoning.push('Detected triple glass configuration');
  keyFeatures.push('triple glass');
  glassDetected = true;
} 
else if (/\b(double|two|2).*(fold|panel|glass|pane)\b/gi.test(inputLower) || 
         (/\b(double|two)\b/gi.test(inputLower) && /\bglass\b/gi.test(inputLower))) {
  config.glassType = 'double';
  config.enclosureEnabled = true;
  config.selectedSide = 'front';
  reasoning.push('Detected double glass configuration');
  keyFeatures.push('double glass');
  glassDetected = true;
}

// ============================================
// EXPLANATION OF WHY THIS WORKS BETTER:
// ============================================

/*
OLD APPROACH (Complex):
- Used objects with arrays of patterns
- Loop through patterns
- Easy to miss variations

NEW APPROACH (Simple):
- Direct if/else checks
- Multiple conditions with OR (||)
- Catches these patterns:
  ✅ "four glass"
  ✅ "4 glass"
  ✅ "fourfold"
  ✅ "four-fold"
  ✅ "four panel"
  ✅ "four fold glass"
  ✅ "4 panel glass"
  ✅ Even: "I want four" + "with glass" (separate words)

EXAMPLE MATCHES:
- "four glass" → (/\bfour\b/gi.test AND /\bglass\b/gi.test) → fourfold ✓
- "4 panel" → /\b4.*(panel)\b/gi.test → fourfold ✓
- "fivefold" → /\bfive.*(fold)\b/gi.test → fivefold ✓
- "six glass panels" → /\bsix.*(glass|panel)\b/gi.test → sixfold ✓
*/

  // ============================================
  // STEP 3: HEIGHT DETECTION
  // ============================================
  const heightPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres)\s+(?:height|high|tall)/gi,
    /height\s+of\s+(\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres)/gi,
    /(\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres)\s+tall/gi,
    /(?:tall|high)\s+(\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres)/gi,
    /height\s*:?\s*(\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres)?/gi
  ];

  let extractedHeight = null;
  heightPatterns.forEach(pattern => {
    const matches = inputLower.matchAll(pattern);
    for (const match of matches) {
      const value = parseFloat(match[1]);
      if (value >= 2.5 && value <= 6) {
        extractedHeight = value;
        reasoning.push(`Detected ${value}m height`);
        break;
      }
    }
  });

  if (extractedHeight) {
    config.height = extractedHeight;
    keyFeatures.push(`${extractedHeight}m height`);
  }

  // ============================================
  // STEP 4: WIDTH AND DEPTH DETECTION
  // ============================================
  const dimensionPatterns = [
    /(\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres)\s+(?:width|wide)/gi,
    /width\s+of\s+(\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres)/gi,
    /(\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres)\s+(?:depth|deep)/gi,
    /depth\s+of\s+(\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres)/gi,
    /(\d+(?:\.\d+)?)\s*(?:m|meter|metre|meters|metres)/gi,
    /(\d+)\s*by\s*(\d+)/gi,
    /(\d+)\s*x\s*(\d+)/gi
  ];

  let extractedWidth = null;
  let extractedDepth = null;

  dimensionPatterns.forEach(pattern => {
    const matches = inputLower.matchAll(pattern);
    for (const match of matches) {
      const value = parseFloat(match[1]);
      const contextBefore = inputLower.substring(Math.max(0, match.index - 20), match.index);
      const contextAfter = inputLower.substring(match.index, Math.min(inputLower.length, match.index + match[0].length + 20));
      const fullContext = contextBefore + contextAfter;
      
      if (/height|high|tall/i.test(fullContext)) continue;

      if (value >= 3 && value <= 15) {
        if (/width|wide/i.test(fullContext)) {
          extractedWidth = value;
          reasoning.push(`Detected ${value}m width`);
        } else if (/depth|deep/i.test(fullContext)) {
          extractedDepth = value;
          reasoning.push(`Detected ${value}m depth`);
        } else if (!extractedWidth) {
          extractedWidth = value;
          reasoning.push(`Detected ${value}m dimension`);
        } else if (!extractedDepth && value !== extractedWidth) {
          extractedDepth = value;
        }
      }
    }
  });

  if (extractedWidth) {
    config.width = extractedWidth;
    keyFeatures.push(`${extractedWidth}m width`);
  }
  if (extractedDepth) {
    config.depth = extractedDepth;
    keyFeatures.push(`${extractedDepth}m depth`);
  }

  // ============================================
  // STEP 5: SIZE KEYWORDS (only if no numbers)
  // ============================================
  if (!extractedWidth) {
    const sizeKeywords = {
      tiny: 3.5, small: 3.5, compact: 3.5, cozy: 4,
      medium: 5.5, normal: 5.5, standard: 5.5, regular: 5.5,
      large: 7.5, big: 7.5, spacious: 7.5, roomy: 7,
      huge: 9, massive: 9, grand: 9, enormous: 10, luxury: 9
    };

    for (const [keyword, width] of Object.entries(sizeKeywords)) {
      if (new RegExp(`\\b${keyword}\\b`).test(inputLower)) {
        config.width = width;
        reasoning.push(`"${keyword}" = ${width}m`);
        keyFeatures.push(`${keyword} size`);
        break;
      }
    }
  }

  // ============================================
  // STEP 6: GLASS STYLE (withframe, onlyglass, grid)
  // ============================================
  if (/\b(frameless|no.?frame|only.?glass|glass.?only)\b/.test(inputLower)) {
    config.glassStyle = 'onlyglass';
    reasoning.push('Frameless glass style');
  } else if (/\b(grid|gridded|divided|panes)\b/.test(inputLower)) {
    config.glassStyle = 'grid';
    reasoning.push('Grid glass style');
  } else if (/\b(framed|with.?frame|frames)\b/.test(inputLower)) {
    config.glassStyle = 'withframe';
    reasoning.push('Framed glass style');
  }

  // ============================================
  // STEP 7: ENCLOSURE DETECTION
  // ============================================
  if (/\b(open|airy|no.?walls|no.?enclosure)\b/.test(inputLower)) {
    config.enclosureEnabled = false;
    config.selectedSide = null;
    reasoning.push('Open-air design');
  } else if (/\b(glass|window|transparent|enclosed)\b/.test(inputLower)) {
    config.enclosureEnabled = true;
    config.enclosureType = 'glass';
    if (!config.selectedSide) config.selectedSide = 'front';
  }

  // Sliding keywords (if not already detected glass type)
  if (!glassDetected && /\b(sliding|flexible|movable|retractable)\b/.test(inputLower)) {
    config.glassType = 'fourfold';
    config.enclosureEnabled = true;
    config.selectedSide = 'front';
    reasoning.push('Sliding glass system');
  }

  // ============================================
  // STEP 8: LUXURY/BUDGET DETECTION (only if glass not specified)
  // ============================================
  if (!glassDetected) {
    if (/\b(luxury|premium|high.?end|expensive|best|finest|top.?quality)\b/.test(inputLower)) {
      config.glassType = 'sixfold';
      config.enclosureEnabled = true;
      config.selectedSide = 'front';
      config.lightsOn = true;
      if (config.width < 7) config.width = 7.5;
      reasoning.push('Premium luxury configuration');
    } else if (/\b(budget|cheap|affordable|economical|basic)\b/.test(inputLower)) {
      config.glassType = 'double';
      reasoning.push('Cost-optimized design');
    }
  }

  // ============================================
  // STEP 9: LIGHTING
  // ============================================
  if (/\b(light|lighting|lights|led|illuminat|lamp)\b/.test(inputLower)) {
    config.lightsOn = true;
    
    if (/\b(ambient|soft|warm|cozy|mood)\b/.test(inputLower)) {
      config.lightShape = 'circle';
      reasoning.push('Ambient lighting');
    } else if (/\b(bright|functional|task|work)\b/.test(inputLower)) {
      config.lightShape = 'rectangle';
      reasoning.push('Bright functional lighting');
    } else if (/\b(decorative|stylish|design|square|accent)\b/.test(inputLower)) {
      config.lightShape = 'square';
      reasoning.push('Decorative lighting');
    }
  }

  // ============================================
  // STEP 10: ROOF TYPE
  // ============================================
  if (/\b(pitch|pitched|angled|sloped|slope|rain|drainage)\b/.test(inputLower)) {
    config.roofPitchActive = true;
    config.roofPitchAngle = 10;
    reasoning.push('Pitched roof');
  } else if (/\b(flat|level|horizontal)\b/.test(inputLower)) {
    config.roofPitchActive = false;
  }

  // ============================================
  // STEP 11: CONVERSATION HISTORY ADJUSTMENTS
  // ============================================
  if (history.length > 0) {
    if (/\b(bigger|larger|more|increase|expand)\b/.test(inputLower)) {
      config.width = Math.min(config.width + 1.5, 12);
      reasoning.push('Increased size');
    }
    if (/\b(smaller|less|decrease|reduce)\b/.test(inputLower)) {
      config.width = Math.max(config.width - 1.5, 3);
      reasoning.push('Reduced size');
    }
    if (/\b(taller|higher)\b/.test(inputLower)) {
      config.height = Math.min(config.height + 0.5, 6);
      reasoning.push('Increased height');
    }
    if (/\b(shorter|lower)\b/.test(inputLower)) {
      config.height = Math.max(config.height - 0.5, 2.5);
      reasoning.push('Reduced height');
    }
  }

  // ============================================
  // GENERATE RESPONSE
  // ============================================
  


};
// ============================================
// MISSING COMPONENTS - ADD THESE TO YOUR CODE
// ============================================

// ============================================
// 1. ADD THIS FUNCTION RIGHT BEFORE interpretUserInput
// ============================================

// ============================================
// 2. ADD THIS ENTIRE COMPONENT RIGHT BEFORE VerandaSideSelector
// ============================================

// ============================================
// HOUSE TYPE SELECTOR COMPONENT
// ============================================

const HouseTypeSelector = ({ houseType, onHouseTypeChange }) => {
  const houseTypeConfig = {
    tussenwoning: {
      icon: '🏘️',
      label: 'Tussenwoning',
      description: 'Mid-terrace house',
      width: '5m',
      fences: 'Both sides'
    },
    hoekwoning: {
      icon: '🏡',
      label: 'Hoekwoning',
      description: 'Corner house',
      width: '5.5m',
      fences: 'Right side'
    },
    vrijstaand: {
      icon: '🏰',
      label: 'Vrijstaand',
      description: 'Detached house',
      width: '6.5m+',
      fences: 'No fences'
    }
  };

  return (
    <div className={styles.houseTypeSelector}>
      {Object.entries(houseTypeConfig).map(([type, config]) => {
        const isActive = houseType === type;
        
        return (
          <button
            key={type}
            className={`${styles.houseTypeButton} ${isActive ? styles.active : ''}`}
            onClick={() => onHouseTypeChange(type)}
          >
            <div className={styles.houseTypeButtonContent}>
              <div className={styles.houseTypeIcon}>{config.icon}</div>
              <div className={styles.houseTypeInfo}>
                <h4 className={styles.houseTypeLabel}>{config.label}</h4>
                <p className={styles.houseTypeDescription}>{config.description}</p>
                <div className={styles.houseTypeDetails}>
                  <span className={styles.houseTypeTag}>📏 {config.width}</span>
                  <span className={styles.houseTypeTag}>🌳 {config.fences}</span>
                </div>
              </div>
            </div>
            <div className={styles.houseTypeBadge}></div>
          </button>
        );
      })}
    </div>
  );
};
// ============================================
// SIDE WALL OPTIONS COMPONENT
// ============================================

const SideWallSelector = ({ side, value, onChange, showFence }) => {
  const options = ['open', 'glass', 'rabat', 'wood', 'window'];
  
  return (
    <div className={styles.sideWallSelector}>
      <div className={styles.sideWallHeader}>
        <Label>{side === 'left' ? 'Left Wall' : 'Right Wall'}</Label>
        {showFence && (
          <span className={styles.fenceIndicator}>
            🏠 Fence visible
          </span>
        )}
      </div>
      
      <div className={styles.sideWallGrid}>
        {options.map(option => {
          const config = SIDE_WALL_OPTIONS[option];
          const isActive = value === option;
          
          return (
            <button
              key={option}
              onClick={() => onChange(option)}
              className={`${styles.sideWallOption} ${isActive ? styles.active : ''}`}
              title={config.description}
            >
              <span className={styles.sideWallOptionLabel}>{config.label}</span>
              {config.price > 0 && (
                <span className={styles.sideWallOptionPrice}>
                  {config.price === 1.5 ? '€€€' : config.price === 1.3 ? '€€+' : '€€'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};


const AIAssistantModal = ({ show, onClose, onApplyConfig }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [conversationMode, setConversationMode] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);
  
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');

  const questions = [
    {
      id: 'purpose',
      question: 'What will be the primary use of your veranda?',
      options: [
        { value: 'dining', label: '🍽️ Outdoor Dining', description: 'Host meals and gatherings' },
        { value: 'living', label: '🛋️ Extended Living Space', description: 'Relaxation and daily use' },
        { value: 'garden', label: '🌿 Garden Connection', description: 'Enjoy nature year-round' },
        { value: 'entertainment', label: '🎉 Entertainment Hub', description: 'Parties and social events' }
      ]
    },
    {
      id: 'size',
      question: 'How much space do you need?',
      options: [
        { value: 'compact', label: '📏 Compact (3-4m)', description: 'Intimate space for 2-4 people' },
        { value: 'medium', label: '📐 Medium (5-6m)', description: 'Comfortable for 4-6 people' },
        { value: 'spacious', label: '📊 Spacious (7-8m)', description: 'Large gatherings of 8+ people' },
        { value: 'grand', label: '🏛️ Grand (9m+)', description: 'Maximum space and luxury' }
      ]
    },
    {
      id: 'depth',
      question: 'How deep should your veranda extend?',
      options: [
        { value: 'shallow', label: '➡️ Shallow (3-4m)', description: 'Efficient use of space' },
        { value: 'standard', label: '↗️ Standard (4-5m)', description: 'Balanced depth' },
        { value: 'deep', label: '⬆️ Deep (5-6m)', description: 'Maximum coverage' }
      ]
    },
    {
      id: 'style',
      question: 'What style appeals to you?',
      options: [
        { value: 'modern', label: '✨ Modern Minimalist', description: 'Clean lines, sleek design' },
        { value: 'contemporary', label: '🎨 Contemporary', description: 'Balanced and versatile' },
        { value: 'traditional', label: '🏡 Traditional', description: 'Classic and timeless' },
        { value: 'industrial', label: '🏗️ Industrial', description: 'Bold and striking' }
      ]
    },
    {
      id: 'privacy',
      question: 'How much enclosure do you prefer?',
      options: [
        { value: 'open', label: '🌤️ Fully Open', description: 'Maximum airflow and openness' },
        { value: 'partial', label: '🪟 Partial Enclosure', description: 'Side protection only' },
        { value: 'enclosed', label: '🏠 Fully Enclosed', description: 'All sides protected' },
        { value: 'flexible', label: '🔄 Flexible/Sliding', description: 'Adjustable glass panels' }
      ]
    },
    {
      id: 'roofType',
      question: 'What roof style do you prefer?',
      options: [
        { value: 'flat', label: '▬ Flat Roof', description: 'Modern and minimalist' },
        { value: 'pitched', label: '⛰️ Pitched Roof', description: 'Enhanced water drainage' }
      ]
    },
    {
      id: 'lighting',
      question: 'Do you want integrated lighting?',
      options: [
        { value: 'none', label: '🚫 No Lighting', description: 'Keep it simple' },
        { value: 'ambient', label: '💡 Ambient Lighting', description: 'Soft, welcoming glow' },
        { value: 'bright', label: '🔆 Bright Lighting', description: 'Full illumination' },
        { value: 'decorative', label: '✨ Decorative Lighting', description: 'Stylish accent lights' }
      ]
    },
    {
      id: 'frame',
      question: 'What frame color matches your home?',
      options: [
        { value: 'anthracite', label: '⬛ Anthracite Grey', description: 'Modern and sophisticated' },
        { value: 'black', label: '⬛ Black', description: 'Bold and dramatic' },
        { value: 'grey', label: '◾ Grey', description: 'Versatile and neutral' },
        { value: 'white', label: '⬜ White', description: 'Clean and bright' }
      ]
    },
    {
      id: 'weather',
      question: 'What\'s your climate priority?',
      options: [
        { value: 'sun', label: '☀️ Sun Protection', description: 'Shield from intense heat' },
        { value: 'rain', label: '🌧️ Rain Coverage', description: 'Stay dry in all weather' },
        { value: 'wind', label: '💨 Wind Protection', description: 'Shelter from elements' },
        { value: 'balanced', label: '⚖️ Balanced', description: 'All-weather protection' }
      ]
    },
    {
      id: 'budget',
      question: 'What\'s your budget consideration?',
      options: [
        { value: 'essential', label: '💰 Essential', description: 'Focus on basics' },
        { value: 'balanced', label: '💵 Balanced', description: 'Good value and features' },
        { value: 'premium', label: '💎 Premium', description: 'Best quality and features' },
        { value: 'luxury', label: '👑 Luxury', description: 'No compromises' }
      ]
    }
  ];

  if (!show) return null;

  const startVoiceInput = () => {
    setIsListening(true);
    setConversationMode('voice');
    setTranscript('');
    setAiResponse('');
    finalTranscriptRef.current = '';

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setIsListening(false);
      setAiResponse("Sorry, your browser doesn't support speech recognition. Please try Chrome, Edge, or Safari.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcriptPiece = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += transcriptPiece + ' ';
        } else {
          interimTranscript += transcriptPiece;
        }
      }

      setTranscript(finalTranscriptRef.current + interimTranscript);
    };

    recognition.onerror = (event) => {
      console.error('Speech error:', event.error);
      if (event.error === 'no-speech') return;
      
      if (event.error === 'aborted' && isListening) {
        setTimeout(() => {
          if (recognitionRef.current && isListening) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              console.log('Already running');
            }
          }
        }, 100);
      }
    };

    recognition.onend = () => {
      if (isListening && recognitionRef.current) {
        setTimeout(() => {
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.log('Already started or error:', e);
          }
        }, 100);
      }
    };

    try {
      recognition.start();
    } catch (error) {
      console.error('Error starting:', error);
      setIsListening(false);
    }
  };

  const stopVoiceInput = async () => {
    setIsListening(false);
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    const finalText = finalTranscriptRef.current.trim();
    if (finalText && finalText.length > 0) {
      await processVoiceInput(finalText);
    } else {
      setAiResponse("I didn't catch that. Please try again!");
    }
  };
const processVoiceInput = async (userInput) => {
  try {
    setAiResponse('🤔 Understanding your vision with AI...');
    const newHistory = [...conversationHistory, { role: "user", content: userInput }];

    // Call Gemini API
    const geminiResult = await callGeminiAPI(userInput, conversationHistory);

    if (!geminiResult.success) {
      setAiResponse(`⚠️ AI Error: ${geminiResult.error}\n\nUsing fallback configuration...`);
      window.aiGeneratedConfig = geminiResult.fallbackConfig;
      
      let formattedResponse = `💡 I encountered an issue but created a basic configuration:\n\n`;
      formattedResponse += `📐 Configuration:\n`;
      formattedResponse += `✓ ${geminiResult.fallbackConfig.width}m × ${geminiResult.fallbackConfig.depth}m\n`;
      formattedResponse += `✓ ${geminiResult.fallbackConfig.metalMaterial} frame\n`;
      formattedResponse += `✓ ${geminiResult.fallbackConfig.glassType} glass\n`;
      
      setAiResponse(formattedResponse);
      setConversationHistory([...newHistory, { role: "assistant", content: JSON.stringify(geminiResult.fallbackConfig) }]);
      return;
    }

    const config = geminiResult.config;
    
    // Store for "Apply Configuration" button
    window.aiGeneratedConfig = config;

    // Generate natural language response
    let formattedResponse = `✨ Perfect! I've designed your veranda based on your description.\n\n`;
    formattedResponse += `📐 Configuration:\n`;
    formattedResponse += `✓ Dimensions: ${config.width}m wide × ${config.depth}m deep × ${config.height}m high\n`;
    formattedResponse += `✓ Frame: ${config.metalMaterial.charAt(0).toUpperCase() + config.metalMaterial.slice(1)}\n`;
    
    if (config.enclosureEnabled) {
      const glassNames = {
        'double': 'Double', 'triple': 'Triple', 'fourfold': 'Four-fold',
        'fivefold': 'Five-fold', 'sixfold': 'Six-fold'
      };
      formattedResponse += `✓ Glass: ${glassNames[config.glassType] || config.glassType} (${config.glassStyle})\n`;
      formattedResponse += `✓ Enclosure: ${config.selectedSide || 'front'} side\n`;
    } else {
      formattedResponse += `✓ Style: Open-air design\n`;
    }
    
    if (config.roofPitchActive) {
      formattedResponse += `✓ Roof: Pitched (${config.roofPitchAngle}° angle)\n`;
    } else {
      formattedResponse += `✓ Roof: Flat\n`;
    }
    
    if (config.lightsOn) {
      formattedResponse += `✓ Lighting: ${config.lightShape} LED lights\n`;
    }

    if (config.roofAwningPosition === 'top') {
      formattedResponse += `✓ Awning: Roof-mounted\n`;
    }
    
    formattedResponse += `\n💡 Click "Apply Configuration" to see your design!`;
    
    setAiResponse(formattedResponse);
    onApplyConfig(config); 
    setConversationHistory([...newHistory, { role: "assistant", content: JSON.stringify(config) }]);

  } catch (error) {
    console.error('Processing Error:', error);
    setAiResponse("Sorry, there was an error processing your request. Please try again!");
  }
};

  const startQuestionMode = () => {
    setConversationMode('questions');
    setCurrentQuestion(0);
    setAnswers({});
    setShowResults(false);
  };

  const handleAnswerSelect = (questionId, value) => {
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);
    if (currentQuestion < questions.length - 1) {
      setTimeout(() => setCurrentQuestion(currentQuestion + 1), 300);
    }
  };

  const generateConfigFromAnswers = () => {
    const config = {
      width: 5.5, depth: 4.5, height: 3, roofPitchActive: false, roofPitchAngle: 0,
      metalMaterial: 'anthracite', enclosureEnabled: false, glassType: 'double',
      lightsOn: false, lightShape: 'circle', verandaType: 'wall-mounted',
      selectedSide: null, enclosureType: 'glass', glassStyle: 'withframe'
    };

    if (answers.size === 'compact') config.width = 3.5;
    else if (answers.size === 'medium') config.width = 5.5;
    else if (answers.size === 'spacious') config.width = 7.5;
    else if (answers.size === 'grand') config.width = 9;

    if (answers.depth === 'shallow') config.depth = 3.5;
    else if (answers.depth === 'standard') config.depth = 4.5;
    else if (answers.depth === 'deep') config.depth = 5.5;

    if (answers.roofType === 'pitched') {
      config.roofPitchActive = true;
      config.roofPitchAngle = 10;
    }

    if (answers.frame) config.metalMaterial = answers.frame;

    if (answers.privacy === 'partial') {
      config.enclosureEnabled = true;
      config.selectedSide = 'front';
    } else if (answers.privacy === 'enclosed') {
      config.enclosureEnabled = true;
      config.glassType = 'triple';
      config.selectedSide = 'front';
    } else if (answers.privacy === 'flexible') {
      config.enclosureEnabled = true;
      config.glassType = 'fourfold';
      config.selectedSide = 'front';
    }

    if (answers.lighting !== 'none' && answers.lighting) {
      config.lightsOn = true;
      if (answers.lighting === 'decorative') config.lightShape = 'square';
      else if (answers.lighting === 'bright') config.lightShape = 'rectangle';
    }

    if (answers.style === 'modern') {
      if (!answers.frame) config.metalMaterial = 'black';
      config.glassStyle = 'onlyglass';
    }

    if (answers.budget === 'luxury' || answers.budget === 'premium') {
      if (config.enclosureEnabled) {
        config.glassType = answers.privacy === 'flexible' ? 'sixfold' : 'fivefold';
      }
      config.lightsOn = true;
    }

    return config;
  };

  const progressPercent = ((currentQuestion + 1) / questions.length) * 100;

  return (
    <div className={styles.aiModalOverlay}>
      <div className={styles.aiModal}>
        <div className={styles.aiModalHeader}>
          <div>
            <h2 className={styles.aiModalTitle}>AI Design Assistant</h2>
            <p className={styles.aiModalSubtitle}>
              {conversationMode === 'questions' && !showResults 
                ? `Question ${currentQuestion + 1} of ${questions.length}`
                : 'Let our intelligent assistant help you design your perfect veranda'}
            </p>
          </div>
          <button onClick={onClose} className={styles.aiModalClose}>✕</button>
        </div>

        {conversationMode === 'questions' && !showResults && (
          <div style={{ padding: '0 32px', marginBottom: '16px' }}>
            <div style={{ height: '4px', background: 'rgba(61, 51, 111, 0.1)', borderRadius: '2px', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'linear-gradient(90deg, #3d336f 0%, #5a4d8f 100%)', width: `${progressPercent}%`, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        <div className={styles.aiModalBody}>
          {!conversationMode && (
            <div>
              <h3 style={{ margin: '0 0 24px 0', fontSize: '16px', fontWeight: '500', color: '#3d336f', textAlign: 'center' }}>
                How would you like to proceed?
              </h3>
              
              <div style={{ display: 'grid', gap: '16px' }}>
                <button onClick={startVoiceInput} className={styles.aiOptionCard}>
                  <div className={styles.aiOptionIcon}>🎤</div>
                  <h4 className={styles.aiOptionTitle}>Describe Your Vision</h4>
                  <p className={styles.aiOptionDescription}>
                    Speak freely - recording continues until you click "Done". No time limit!
                  </p>
                </button>

                <button onClick={startQuestionMode} className={styles.aiOptionCard}>
                  <div className={styles.aiOptionIcon}>💬</div>
                  <h4 className={styles.aiOptionTitle}>Guided Configuration</h4>
                  <p className={styles.aiOptionDescription}>
                    Answer 10 quick questions for perfect recommendations.
                  </p>
                </button>
              </div>
            </div>
          )}

          {conversationMode === 'voice' && (
            <div>
              {isListening && (
                <div className={styles.aiListening}>
                  <div className={styles.aiListeningIcon}>
                    <span style={{ fontSize: '48px', animation: 'pulse 2s ease-in-out infinite' }}>🎤</span>
                  </div>
                  <p style={{ margin: '16px 0 8px 0', fontSize: '18px', color: '#3d336f', fontWeight: '600' }}>
                    Recording... Speak freely!
                  </p>
                  <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: 'rgba(61, 51, 111, 0.6)' }}>
                    ∞ No time limit • Auto-restarts •  Click &apos;Done&apos; when finished
                  </p>
                  
                  {transcript && (
                    <div style={{ 
                      marginBottom: '20px',
                      padding: '20px', 
                      background: 'linear-gradient(135deg, rgba(61, 51, 111, 0.08) 0%, rgba(61, 51, 111, 0.12) 100%)', 
                      borderRadius: '12px',
                      border: '2px solid rgba(61, 51, 111, 0.2)',
                      minHeight: '80px',
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      <p style={{ margin: 0, fontSize: '15px', color: '#3d336f', lineHeight: '1.8', fontWeight: '500' }}>
                        {transcript}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={stopVoiceInput}
                    style={{
                      padding: '16px 48px',
                      background: 'linear-gradient(135deg, #3d336f 0%, #5a4d8f 100%)',
                      border: 'none',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '16px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      boxShadow: '0 6px 20px rgba(61, 51, 111, 0.4)',
                      transition: 'all 0.3s'
                    }}
                    onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
                    onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
                  >
                    ✓ Done Speaking
                  </button>
                </div>
              )}

              {!isListening && transcript && (
                <div style={{ marginBottom: '24px' }}>
                  <div className={styles.aiTranscriptBox}>
                    <p className={styles.aiLabel}>You said:</p>
                    <p style={{ margin: 0, fontSize: '14px', color: '#3d336f', lineHeight: '1.6' }}>{transcript}</p>
                  </div>
                </div>
              )}

              {aiResponse && !isListening && (
                <div>
                  <div className={styles.aiResponseBox}>
                    <p className={styles.aiLabel}>AI Recommendation:</p>
                    <p className={styles.aiText}>{aiResponse}</p>
                  </div>

                  <div className={styles.buttonGroup}>
                    <button
                      onClick={() => {
                        const config = window.aiGeneratedConfig || {};
                        onApplyConfig(config);
                        onClose();
                      }}
                      className={styles.aiApplyButton}
                    >
                      Apply Configuration
                    </button>
                    <button 
                      onClick={() => { 
                        setTranscript(''); 
                        setAiResponse('');
                        finalTranscriptRef.current = '';
                        startVoiceInput(); 
                      }}
                      style={{ 
                        flex: 1, 
                        padding: '14px 24px', 
                        background: 'rgba(61, 51, 111, 0.08)', 
                        border: '1.5px solid rgba(61, 51, 111, 0.2)', 
                        borderRadius: '10px', 
                        color: '#3d336f', 
                        fontSize: '14px', 
                        fontWeight: '600', 
                        cursor: 'pointer' 
                      }}
                    >
                      🎤 Speak Again
                    </button>
                    <button 
                      onClick={() => { 
                        setConversationMode(null); 
                        setTranscript(''); 
                        setAiResponse(''); 
                        setConversationHistory([]);
                        finalTranscriptRef.current = '';
                      }}
                      className={styles.aiSecondaryButton}
                    >
                      Start Over
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {conversationMode === 'questions' && !showResults && (
            <div>
              <h3 style={{ margin: '0 0 24px 0', fontSize: '18px', fontWeight: '500', color: '#3d336f', lineHeight: '1.4' }}>
                {questions[currentQuestion].question}
              </h3>

              <div style={{ display: 'grid', gap: '12px' }}>
                {questions[currentQuestion].options.map((option) => (
                  <button 
                    key={option.value} 
                    onClick={() => handleAnswerSelect(questions[currentQuestion].id, option.value)}
                    className={styles.aiOptionCard}
                    style={{
                      textAlign: 'left',
                      background: answers[questions[currentQuestion].id] === option.value 
                        ? 'linear-gradient(135deg, rgba(61, 51, 111, 0.15) 0%, rgba(61, 51, 111, 0.2) 100%)' 
                        : 'linear-gradient(135deg, rgba(61, 51, 111, 0.05) 0%, rgba(61, 51, 111, 0.08) 100%)',
                      border: answers[questions[currentQuestion].id] === option.value 
                        ? '2px solid #3d336f' 
                        : '2px solid rgba(61, 51, 111, 0.15)'
                    }}
                  >
                    <h4 className={styles.aiOptionTitle} style={{ fontSize: '15px', marginBottom: '4px' }}>
                      {option.label}
                    </h4>
                    <p className={styles.aiOptionDescription} style={{ fontSize: '12px' }}>
                      {option.description}
                    </p>
                  </button>
                ))}
              </div>

              {currentQuestion === questions.length - 1 && answers[questions[currentQuestion].id] && (
                <button 
                  onClick={() => setShowResults(true)}
                  style={{ 
                    width: '100%', 
                    marginTop: '24px', 
                    padding: '16px', 
                    background: 'linear-gradient(135deg, #3d336f 0%, #5a4d8f 100%)', 
                    border: 'none', 
                    borderRadius: '12px', 
                    color: '#fff', 
                    fontSize: '15px', 
                    fontWeight: '600', 
                    cursor: 'pointer' 
                  }}
                >
                  Show My Perfect Veranda ✨
                </button>
              )}

              {currentQuestion > 0 && (
                <button 
                  onClick={() => setCurrentQuestion(currentQuestion - 1)}
                  style={{ 
                    width: '100%', 
                    marginTop: '12px', 
                    padding: '14px', 
                    background: 'rgba(61, 51, 111, 0.05)', 
                    border: '1.5px solid rgba(61, 51, 111, 0.2)', 
                    borderRadius: '10px', 
                    color: '#3d336f', 
                    fontSize: '14px', 
                    fontWeight: '600', 
                    cursor: 'pointer' 
                  }}
                >
                  ← Previous Question
                </button>
              )}
            </div>
          )}

          {conversationMode === 'questions' && showResults && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✨</div>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '22px', fontWeight: '500', color: '#3d336f' }}>
                  Your Perfect Veranda
                </h3>
              </div>

              <div className={styles.buttonGroup} style={{ flexDirection: 'column', gap: '12px' }}>
                <button 
                  onClick={() => { 
                    onApplyConfig(generateConfigFromAnswers()); 
                    onClose(); 
                  }}
                  className={styles.aiApplyButton} 
                  style={{ width: '100%', padding: '16px', fontSize: '15px' }}
                >
                  Apply to Configurator 🎯
                </button>
                <button 
                  onClick={() => { 
                    setConversationMode(null); 
                    setAnswers({}); 
                    setCurrentQuestion(0); 
                    setShowResults(false); 
                  }}
                  className={styles.aiSecondaryButton} 
                  style={{ width: '100%' }}
                >
                  Start Over
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
const generateNaturalResponse = (config, features, input) => {
  return {
    main: 'Configuration ready based on your preferences!'
  };
};
// ============================================
// END OF MISSING COMPONENTS
// ============================================
// Keep your existing generateNaturalResponse function - no changes needed

const VerandaSideSelector = ({ selectedSide, onSideSelect }) => {
  const sides = [
    { id: 'front', label: 'Front', x: 70, y: 80, width: 80, height: 50 },
    { id: 'left', label: 'Left', x: 20, y: 50, width: 40, height: 60 },
    { id: 'right', label: 'Right', x: 160, y: 50, width: 40, height: 60 }
  ];

  return (
    <svg viewBox="0 0 220 140" style={{ width: '100%', maxWidth: '220px', margin: '0 auto', display: 'block' }}>
      {sides.map(side => (
        <g key={side.id}>
          <rect
            x={side.x}
            y={side.y}
            width={side.width}
            height={side.height}
            fill={selectedSide === side.id ? 'rgba(61, 51, 111, 0.15)' : 'rgba(246, 246, 246, 0.03)'}
            stroke={selectedSide === side.id ? '#3d336f' : 'rgba(61, 51, 111, 0.2)'}
            strokeWidth="2"
            rx="4"
            style={{ cursor: 'pointer', transition: 'all 0.3s' }}
            onClick={() => onSideSelect(side.id)}
          />
          <text
            x={side.x + side.width / 2}
            y={side.y + side.height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={selectedSide === side.id ? '#3d336f' : 'rgba(61, 51, 111, 0.5)'}
            fontSize="11"
            fontWeight="500"
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            {side.label}
          </text>
        </g>
      ))}
    </svg>
  );
};

const PriceDisplay = ({ pricing }) => {
  if (!pricing) return null;

  return (
    <div className={styles.priceDisplay}>
      <div className={styles.priceMain}>
        <h4 className={styles.priceTitle}>Estimated Price</h4>
        <div className={styles.priceAmount}>
          €{pricing.total.retail.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <p className={styles.priceSubtitle}>Including VAT & Installation</p>
      </div>

      <div className={styles.priceBreakdown}>
        <div className={styles.priceItem}>
          <span className={styles.priceItemLabel}>
            Base Roof ({pricing.roof.dimensions.width/1000}m × {pricing.roof.dimensions.depth/1000}m)
          </span>
          <span className={styles.priceItemValue}>
            €{pricing.roof.retail.toFixed(2)}
          </span>
        </div>

        {pricing.enclosures.left && !pricing.enclosures.left.error && (
          <div className={styles.priceItem}>
            <span className={styles.priceItemLabel}>Left Enclosure</span>
            <span className={styles.priceItemValue}>
              €{pricing.enclosures.left.retail.toFixed(2)}
            </span>
          </div>
        )}

        {pricing.enclosures.right && !pricing.enclosures.right.error && (
          <div className={styles.priceItem}>
            <span className={styles.priceItemLabel}>Right Enclosure</span>
            <span className={styles.priceItemValue}>
              €{pricing.enclosures.right.retail.toFixed(2)}
            </span>
          </div>
        )}

        {pricing.lighting && (
          <div className={styles.priceItem}>
            <span className={styles.priceItemLabel}>
              LED Lighting ({pricing.lighting.lightCount} lights)
            </span>
            <span className={styles.priceItemValue}>
              €{pricing.lighting.retail.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      <button className={styles.priceQuoteButton}>Request Quote</button>

      <p className={styles.priceDisclaimer}>
        Final price may vary based on site conditions and custom requirements
      </p>
    </div>
  );
};
// ============================================
// GLASS TYPE SELECTOR COMPONENT
// ============================================
const GlassTypeSelector = ({ side, glassType, onChange, material }) => {
  if (material !== 'glass') return null;
  
  return (
    <div style={{ marginTop: '16px' }}>
      <Label>Glass Configuration</Label>
      <select
        value={glassType}
        onChange={(e) => onChange(side, e.target.value)}
        className={styles.selectInput}
      >
        <option value="double">Double Glass</option>
        <option value="triple">Triple Glass</option>
        <option value="fourfold">Fourfold Glass</option>
        <option value="fivefold">Fivefold Glass</option>
        <option value="sixfold">Sixfold Glass</option>
      </select>
    </div>
  );
};
// ============================================
// TINTED GLASS SELECTOR COMPONENT
// ============================================
const TintedGlassSelector = ({ enabled, onToggle, color, onColorChange }) => {
  return (
    <div style={{ marginTop: '20px' }}>
      <MinimalCheckbox
        checked={enabled}
        onChange={onToggle}
        label="Tinted Glass"
      />
      
      {enabled && (
        <div style={{ marginTop: '16px' }}>
          <Label>Glass Tint</Label>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '8px',
            marginTop: '8px'
          }}>
            {Object.entries(GLASS_TINT_COLORS).map(([key, config]) => (
              <button
                key={key}
                onClick={() => onColorChange(key)}
                className={`${styles.materialButton} ${color === key ? styles.active : ''}`}
                style={{ 
                  padding: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  minHeight: '70px'
                }}
                title={config.description}
              >
                <div 
                  style={{ 
                    backgroundColor: config.color,
                    opacity: config.opacity,
                    width: '100%',
                    height: '32px',
                    borderRadius: '4px',
                    border: '1px solid rgba(61, 51, 111, 0.2)'
                  }} 
                />
                <span style={{ 
                  fontSize: '10px', 
                  fontWeight: '500',
                  textAlign: 'center',
                  lineHeight: '1.2'
                }}>
                  {config.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
const ConfigurationPanel = ({ 
  isMobile,
  roofPitchActive, 
  setRoofPitchActive,
  roofPitchAngle,
  setRoofPitchAngle,
    houseType,              // 🆕 ADD THIS
  onHouseTypeChange, 
   leftWallOption,         // 🆕 ADD THIS
  setLeftWallOption,      // 🆕 ADD THIS
  rightWallOption,        // 🆕 ADD THIS
  setRightWallOption,     // 🆕 ADD THIS
  showLeftFence,          // 🆕 ADD THIS
  showRightFence    ,      // 🆕 ADD THIS
  roofAwningPosition,
  setRoofAwningPosition,
  metalMaterial,
  setMetalMaterial,
  enclosureEnabled,
  setEnclosureEnabled,
  enclosureType,
  setEnclosureType,
  glassType,
  setGlassType,
  glassStyle,
  setGlassStyle,
  selectedSide,
  setSelectedSide,
  lightsOn,
  setLightsOn,
  lightShape,
  setLightShape,
  lightColor,
  setLightColor,
  setEnclosureView,
  width,
  setWidth,
  depth,
  setDepth,
  height,
  setHeight,
  verandaType,
  setVerandaType,
  showAIModal,
  setShowAIModal,
  pricing,
   sideEnclosureTypes,        // 🆕 ADD
  setSideEnclosureTypes,     // 🆕 ADD
  tintedGlassEnabled,        // 🆕 ADD
  setTintedGlassEnabled,     // 🆕 ADD
  glassColor,                // 🆕 ADD
  setGlassColor              // 🆕 ADD
}) => {
   const handleSideSelect = (sideId) => {
    if (selectedSide === sideId) {
      setSelectedSide(null);
      setEnclosureView(null);
    } else {
      setSelectedSide(sideId);
      setEnclosureView(sideId);
    }
  };
  
  // 🆕 Handler for changing material type (glass/metal/wood/window)
  const handleMaterialChange = (side, material) => {
    setSideEnclosureTypes(prev => ({
      ...prev,
      [side]: {
        ...prev[side],
        material: material,
        glassType: prev[side]?.glassType || 'double' // Keep existing glass type
      }
    }));
    
    // Update enclosureType for backward compatibility
   
  };
  
// 🆕 Handler for changing glass type - SYNCS ALL SIDES
// REPLACE the existing handleGlassTypeChange with this:
const handleGlassTypeChange = (side, newGlassType) => {
  setSideEnclosureTypes(prev => ({
    ...prev,
    [side]: { 
      ...prev[side], 
      glassType: newGlassType 
    }
  }));

  // Only update the global 'glassType' if we are changing the front
  // (This keeps the main UI consistent with the main view)
  if (side === 'front') {
    setGlassType(newGlassType);
  }
};

  const showGlassOptions = selectedSide && sideEnclosureTypes[selectedSide]?.material === 'glass';
  return (
    <div className={`${styles.configPanel} ${isMobile ? styles.mobile : ''}`}>
      <div className={`${styles.configPanelContent} ${isMobile ? styles.mobile : ''}`}>
        <div className={styles.configPanelInner}>
          
          <h1 className={styles.headerTitle}>Configure</h1>
          <p className={styles.headerSubtitle}>Customize your veranda design</p>

          <button onClick={() => setShowAIModal(true)} className={styles.aiTriggerButton}>
            <span style={{ fontSize: '20px' }}>✨</span>
            Let AI Design For You
          </button>
<HouseTypeSelector 
  houseType={houseType}
  onHouseTypeChange={onHouseTypeChange}
/>
          <Section title="Type">
            <div className={styles.grid2}>
              <MinimalButton
                active={verandaType === 'wall-mounted'}
                onClick={() => setVerandaType('wall-mounted')}
              >
                Wall-mounted
              </MinimalButton>
              <MinimalButton
                active={verandaType === 'freestanding'}
                onClick={() => setVerandaType('freestanding')}
              >
                Freestanding
              </MinimalButton>
            </div>
          </Section>

          <Section title="Dimensions">
            <div className={styles.grid2}>
              <DimensionInput label="Width" value={width} onChange={setWidth} unit="m" />
              <DimensionInput label="Depth" value={depth} onChange={setDepth} unit="m" />
            </div>
            <div style={{ marginTop: '16px' }}>
              <DimensionInput label="Height" value={height} onChange={setHeight} unit="m" />
            </div>
          </Section>

          <Section title="Roof">
            <MinimalCheckbox
              checked={roofPitchActive}
              onChange={setRoofPitchActive}
              label="Pitched Roof"
            />

            {roofPitchActive && (
              <div style={{ marginTop: '20px' }}>
                <MinimalSlider label="Pitch Angle" value={roofPitchAngle} onChange={setRoofPitchAngle} min={0} max={15} unit="°" />
              </div>
            )}
          </Section>

          <Section title="Awning">
            <div className={styles.grid2}>
              <MinimalButton
                active={roofAwningPosition === 'none'}
                onClick={() => setRoofAwningPosition('none')}
              >
                None
              </MinimalButton>
              <MinimalButton
                active={roofAwningPosition === 'top'}
                onClick={() => setRoofAwningPosition('top')}
              >
                Top
              </MinimalButton>
            </div>
          </Section>

          <Section title="Frame">
            <div className={styles.grid2}>
              <MaterialButton
                active={metalMaterial === 'anthracite'}
                onClick={() => setMetalMaterial('anthracite')}
                color="#28282d"
                label="Anthracite"
              />
              <MaterialButton
                active={metalMaterial === 'black'}
                onClick={() => setMetalMaterial('black')}
                color="#000000"
                label="Black"
              />
              <MaterialButton
                active={metalMaterial === 'grey'}
                onClick={() => setMetalMaterial('grey')}
                color="#808080"
                label="Grey"
              />
              <MaterialButton
                active={metalMaterial === 'white'}
                onClick={() => setMetalMaterial('white')}
                color="#f5f5f5"
                label="White"
              />
            </div>
          </Section>

  <Section title="Enclosures">
  <MinimalCheckbox
    checked={enclosureEnabled}
    onChange={setEnclosureEnabled}
    label="Add Enclosure"
  />

  {enclosureEnabled && (
    <>
      <div style={{ marginTop: '24px', marginBottom: '24px' }}>
        <VerandaSideSelector 
          selectedSide={selectedSide}
          onSideSelect={handleSideSelect}
        />
      </div>

    {selectedSide && (
  <>
    {/* Material Selection */}
    <div style={{ marginBottom: '20px' }}>
      <Label>Material</Label>
      <div className={styles.grid4}>
        <MinimalButton
          active={sideEnclosureTypes[selectedSide]?.material === 'glass'}
          onClick={() => handleMaterialChange(selectedSide, 'glass')}
          small
        >
          Glass
        </MinimalButton>
        <MinimalButton
          active={sideEnclosureTypes[selectedSide]?.material === 'metal'}
          onClick={() => selectedSide !== 'front' && handleMaterialChange(selectedSide, 'metal')}
          small
          disabled={selectedSide === 'front'}
          style={{
            opacity: selectedSide === 'front' ? 0.4 : 1,
            cursor: selectedSide === 'front' ? 'not-allowed' : 'pointer'
          }}
        >
          Metal
        </MinimalButton>
        <MinimalButton
          active={sideEnclosureTypes[selectedSide]?.material === 'wood'}
          onClick={() => selectedSide !== 'front' && handleMaterialChange(selectedSide, 'wood')}
          small
          disabled={selectedSide === 'front'}
          style={{
            opacity: selectedSide === 'front' ? 0.4 : 1,
            cursor: selectedSide === 'front' ? 'not-allowed' : 'pointer'
          }}
        >
          Wood
        </MinimalButton>
        <MinimalButton
          active={sideEnclosureTypes[selectedSide]?.material === 'window'}
          onClick={() => selectedSide !== 'front' && handleMaterialChange(selectedSide, 'window')}
          small
          disabled={selectedSide === 'front'}
          style={{
            opacity: selectedSide === 'front' ? 0.4 : 1,
            cursor: selectedSide === 'front' ? 'not-allowed' : 'pointer'
          }}
        >
          Window
        </MinimalButton>
      </div>
    </div>

          {/* 🆕 Glass Type Selector */}
     {/* 🆕 Glass Type Selector */}
<GlassTypeSelector
  side={selectedSide}
  glassType={sideEnclosureTypes[selectedSide]?.glassType || 'double'}
  onChange={handleGlassTypeChange}
  material={sideEnclosureTypes[selectedSide]?.material}
/>



{/* Glass Style (Frame/Glass/Grid) - Available for ALL sides */}
{sideEnclosureTypes[selectedSide]?.material === 'glass' && (
  <div style={{ marginTop: '20px' }}>
    <Label>Style</Label>
    <div className={styles.grid3}>
      <MinimalButton
        active={glassStyle === 'withframe'}
        onClick={() => setGlassStyle('withframe')}
        small
      >
        Frame
      </MinimalButton>
      <MinimalButton
        active={glassStyle === 'onlyglass'}
        onClick={() => setGlassStyle('onlyglass')}
        small
      >
        Glass
      </MinimalButton>
      <MinimalButton
        active={glassStyle === 'grid'}
        onClick={() => setGlassStyle('grid')}
        small
      >
        Grid
      </MinimalButton>
    </div>
  </div>
)}

          {/* 🆕 Tinted Glass Selector */}
          {sideEnclosureTypes[selectedSide]?.material === 'glass' && (
            <TintedGlassSelector
              enabled={tintedGlassEnabled}
              onToggle={setTintedGlassEnabled}
              color={glassColor}
              onColorChange={setGlassColor}
            />
          )}

          {/* Glass Style (only for front) */}
          {selectedSide === 'front' && sideEnclosureTypes[selectedSide]?.material === 'glass' && (
            <div style={{ marginTop: '20px' }}>
              <Label>Style</Label>
              <div className={styles.grid3}>
                <MinimalButton
                  active={glassStyle === 'withframe'}
                  onClick={() => setGlassStyle('withframe')}
                  small
                >
                  Frame
                </MinimalButton>
                <MinimalButton
                  active={glassStyle === 'onlyglass'}
                  onClick={() => setGlassStyle('onlyglass')}
                  small
                >
                  Glass
                </MinimalButton>
                <MinimalButton
                  active={glassStyle === 'grid'}
                  onClick={() => setGlassStyle('grid')}
                  small
                >
                  Grid
                </MinimalButton>
              </div>
            </div>
          )}
        </>
      )}
    </>
  )}
</Section>

          <Section title="Lighting">
            <MinimalCheckbox
              checked={lightsOn}
              onChange={setLightsOn}
              label="Enable Lights"
            />

            {lightsOn && (
              <>
                <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                  <Label>Shape</Label>
                  <div className={styles.grid3}>
                    <MinimalButton
                      active={lightShape === 'circle'}
                      onClick={() => setLightShape('circle')}
                      small
                    >
                      Circle
                    </MinimalButton>
                    <MinimalButton
                      active={lightShape === 'rectangle'}
                      onClick={() => setLightShape('rectangle')}
                      small
                    >
                      Rectangle
                    </MinimalButton>
                    <MinimalButton
                      active={lightShape === 'square'}
                      onClick={() => setLightShape('square')}
                      small
                    >
                      Square
                    </MinimalButton>
                  </div>
                </div>

                <div>
                  <Label>Color</Label>
                  <input
                    type="color"
                    value={lightColor}
                    onChange={(e) => setLightColor(e.target.value)}
                    className={styles.colorInput}
                  />
                </div>
              </>
            )}
          </Section>

          <PriceDisplay pricing={pricing} />
        </div>
      </div>
    </div>
  );
};

const Section = ({ title, children }) => (
  <div className={styles.section}>
    <h3 className={styles.sectionTitle}>{title}</h3>
    {children}
  </div>
);

const Label = ({ children }) => (
  <label className={styles.label}>{children}</label>
);

const MinimalButton = ({ active, onClick, children, small }) => (
  <button
    onClick={onClick}
    className={`${styles.minimalButton} ${active ? styles.active : ''} ${small ? styles.small : ''}`}
  >
    {children}
  </button>
);

const MaterialButton = ({ active, onClick, color, label }) => (
  <button
    onClick={onClick}
    className={`${styles.materialButton} ${active ? styles.active : ''}`}
  >
    <div className={styles.materialColorSwatch} style={{ backgroundColor: color }} />
    <span className={styles.materialLabel}>{label}</span>
  </button>
);

const MinimalCheckbox = ({ checked, onChange, label }) => (
  <label className={`${styles.minimalCheckboxContainer} ${checked ? styles.checked : ''}`}>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={styles.minimalCheckbox}
    />
    <span className={styles.minimalCheckboxLabel}>{label}</span>
  </label>
);

const MinimalSlider = ({ label, value, onChange, min, max, unit }) => (
  <div className={styles.sliderContainer}>
    <div className={styles.sliderHeader}>
      <span className={styles.sliderLabel}>{label}</span>
      <span className={styles.sliderValue}>{value}{unit}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={unit === '°' ? 1 : 0.1}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className={styles.sliderInput}
    />
  </div>
);

const DimensionInput = ({ label, value, onChange, unit }) => (
  <div>
    <Label>{label}</Label>
    <div className={styles.dimensionInputContainer}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        step="0.5"
        min="3"
        max="15"
        className={styles.dimensionInput}
      />
      <span className={styles.dimensionUnit}>{unit}</span>
    </div>
  </div>
);

const TimeToggle = ({ timeOfDay, setTimeOfDay }) => (
  <div className={styles.timeToggle}>
    <button
      onClick={() => setTimeOfDay('day')}
      className={`${styles.timeToggleButton} ${timeOfDay === 'day' ? styles.active : ''}`}
      title="Day mode"
    >
      ☀️
    </button>
    <button
      onClick={() => setTimeOfDay('night')}
      className={`${styles.timeToggleButton} ${timeOfDay === 'night' ? styles.active : ''}`}
      title="Night mode"
    >
      🌙
    </button>
  </div>
);
// const CameraModeToggle = ({ cameraMode, setCameraMode }) => (
//   <div className={styles.timeToggle} style={{ top: '80px' }}>
//     <button
//       onClick={() => setCameraMode('exterior')}
//       className={`${styles.timeToggleButton} ${cameraMode === 'exterior' ? styles.active : ''}`}
//       title="Exterior view"
//     >
//       🏠
//     </button>
//     <button
//       onClick={() => setCameraMode('interior')}
//       className={`${styles.timeToggleButton} ${cameraMode === 'interior' ? styles.active : ''}`}
//       title="Interior view"
//     >
//       🪟
//     </button>
//   </div>
// );
// const CameraAngleDisplay = () => {
//   // const { camera } = useThree();const [cameraMode, setCameraMode] = useState('exterior');
//   const [horizontalAngle, setHorizontalAngle] = useState(0);
//   const [verticalAngle, setVerticalAngle] = useState(0);

//   useFrame(() => {
//     const cameraPos = camera.position;
    
//     // Horizontal angle (azimuth) - rotation around Y axis
//     const angleRad = Math.atan2(cameraPos.x, cameraPos.z);
//     const normalizedAngle = ((angleRad * (180 / Math.PI) + 360) % 360);
//     setHorizontalAngle(Math.round(normalizedAngle));
    
//     // Vertical angle (elevation) - up/down angle
//     const distance = Math.sqrt(cameraPos.x * cameraPos.x + cameraPos.z * cameraPos.z);
//     const elevationRad = Math.atan2(cameraPos.y, distance);
//     const elevationDeg = elevationRad * (180 / Math.PI);
    
//     setVerticalAngle(Math.round(elevationDeg));

//   });

//   return (
//     <Html position={[0, 0, 0]} center style={{ pointerEvents: 'none' }}>
//       <div style={{
//         position: 'fixed',
//         top: '20px',
//         left: '20px',
//         background: 'rgba(0, 0, 0, 0.85)',
//         color: '#fff',
//         padding: '16px 24px',
//         borderRadius: '12px',
//         fontFamily: 'monospace',
//         fontSize: '15px',
//         fontWeight: 'bold',
//         zIndex: 1000,
//         boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
//         border: '1px solid rgba(255, 255, 255, 0.1)'
//       }}>
//         <div style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
//           <span style={{ color: '#60a5fa', minWidth: '100px' }}>Horizontal:</span>
//           <span style={{ color: '#fff', fontWeight: '900' }}>{horizontalAngle}°</span>
//         </div>
//         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//           <span style={{ color: '#34d399', minWidth: '100px' }}>Vertical:</span>
//           <span style={{ color: '#fff', fontWeight: '900' }}>{verticalAngle}°</span>
//         </div>
//       </div>
//     </Html>
//   );
// };
const VerandaConfiguratorFinal = () => {
  const [loaded, setLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // 🆕 Load Tussenwoning configuration as default
  const [houseType, setHouseType] = useState('tussenwoning');
  
  // 🆕 Apply Tussenwoning defaults immediately
  const tussenwoningDefaults = HOUSE_TYPE_DEFAULTS.tussenwoning;
  
  const [leftWallOption, setLeftWallOption] = useState(tussenwoningDefaults.leftWallOption);
  const [rightWallOption, setRightWallOption] = useState(tussenwoningDefaults.rightWallOption);
  const [showLeftFence, setShowLeftFence] = useState(tussenwoningDefaults.showLeftFence);
  const [showRightFence, setShowRightFence] = useState(tussenwoningDefaults.showRightFence);
  
  const [roofPitchActive, setRoofPitchActive] = useState(true);
  const [roofPitchAngle, setRoofPitchAngle] = useState(0);
  const [roofAwningPosition, setRoofAwningPosition] = useState('none');
  
  const [metalMaterial, setMetalMaterial] = useState(tussenwoningDefaults.metalMaterial);
  const [enclosureEnabled, setEnclosureEnabled] = useState(tussenwoningDefaults.enclosureEnabled);
  const [enclosureType, setEnclosureType] = useState('glass');
  const [glassType, setGlassType] = useState(tussenwoningDefaults.glassType);
  const [glassStyle, setGlassStyle] = useState('withframe');
  const [selectedSide, setSelectedSide] = useState(tussenwoningDefaults.selectedSide);
  
  const [lightsOn, setLightsOn] = useState(false);
  const [lightShape, setLightShape] = useState('circle');
  const [timeOfDay, setTimeOfDay] = useState('day');
  const [lightColor, setLightColor] = useState('#ffd700');
  const [enclosureView, setEnclosureView] = useState(null);
  
  const [width, setWidth] = useState(tussenwoningDefaults.width);
  const [depth, setDepth] = useState(tussenwoningDefaults.depth);
  const [height, setHeight] = useState(tussenwoningDefaults.height);
  
  const [verandaType, setVerandaType] = useState('wall-mounted');
  const [showAIModal, setShowAIModal] = useState(false);
const [cameraMode, setCameraMode] = useState('exterior');
  
const [sideEnclosureTypes, setSideEnclosureTypes] = useState({
  front: { material: 'glass', glassType: 'triple' },
  left: { material: 'glass', glassType: 'triple' },
  right: { material: 'glass', glassType: 'triple' }
});
useEffect(() => {
  setSideEnclosureTypes(prev => ({
    front: { ...prev.front, glassType: glassType },
    left: { ...prev.left, glassType: glassType },
    right: { ...prev.right, glassType: glassType }
  }));
}, [glassType]);
// 🆕 ADD: Tinted glass state
const [tintedGlassEnabled, setTintedGlassEnabled] = useState(false);
const [glassColor, setGlassColor] = useState('clear');



   const pricing = useMemo(() => {
    const calculator = new PriceCalculator();
    const config = {
      model: 'castor',
      depth: depth * 1000,
      width: width * 1000,
      roofType: 'polycarbonate',
      enclosures: {
        left: enclosureEnabled && sideEnclosureTypes.left !== 'none',
        right: enclosureEnabled && sideEnclosureTypes.right !== 'none'
      },
      lighting: lightsOn ? 10 : 0
    };
    return calculator.calculateCompleteVeranda(config);
  }, [width, depth, enclosureEnabled, sideEnclosureTypes, lightsOn]);



const handleEnclosureTypeChange = (newType) => {
  setEnclosureType(newType);
  if (selectedSide) {
    setSideEnclosureTypes(prev => ({
      ...prev,
      [selectedSide]: {
        ...prev[selectedSide],
        material: newType
      }
    }));
  }
};

// ============================================
// FIXED handleApplyAIConfig - ADD ALL MISSING PARAMETERS
// Replace your existing handleApplyAIConfig function (around line 2095)
// ============================================
// ============================================
// HOUSE TYPE CHANGE HANDLER
// ============================================

const handleHouseTypeChange = (newType) => {
  const defaults = HOUSE_TYPE_DEFAULTS[newType];
  
  // Apply all defaults
 setHouseType(newType);
  setWidth(defaults.width);
  setDepth(defaults.depth);
  setHeight(defaults.height);
  setLeftWallOption(defaults.leftWallOption);
  setRightWallOption(defaults.rightWallOption);
  setShowLeftFence(defaults.showLeftFence);
  setShowRightFence(defaults.showRightFence);
  setMetalMaterial(defaults.metalMaterial);
  setEnclosureEnabled(defaults.enclosureEnabled);
  setSelectedSide(defaults.selectedSide);
  setGlassType(defaults.glassType);
  
  console.log(`✅ Switched to ${defaults.label}`);
};
const handleApplyAIConfig = (config) => {
  console.log('AI Config received:', config);
  
  // Apply ALL parameters
  if (config.width !== undefined) setWidth(config.width);
  if (config.depth !== undefined) setDepth(config.depth);
  if (config.height !== undefined) setHeight(config.height);
  if (config.glassType !== undefined) setGlassType(config.glassType);
  if (config.metalMaterial !== undefined) setMetalMaterial(config.metalMaterial);
  if (config.lightsOn !== undefined) setLightsOn(config.lightsOn);
  if (config.lightShape !== undefined) setLightShape(config.lightShape);
  if (config.lightColor !== undefined) setLightColor(config.lightColor);
  if (config.enclosureEnabled !== undefined) setEnclosureEnabled(config.enclosureEnabled);
  if (config.selectedSide !== undefined) setSelectedSide(config.selectedSide);
  if (config.enclosureType !== undefined) setEnclosureType(config.enclosureType);
  if (config.glassStyle !== undefined) setGlassStyle(config.glassStyle);
  if (config.roofPitchActive !== undefined) setRoofPitchActive(config.roofPitchActive);
  if (config.roofPitchAngle !== undefined) setRoofPitchAngle(config.roofPitchAngle);
  if (config.roofAwningPosition !== undefined) setRoofAwningPosition(config.roofAwningPosition);
  if (config.verandaType !== undefined) setVerandaType(config.verandaType);
  
  // Handle side enclosure types
  if (config.selectedSide && config.enclosureType) {
    setSideEnclosureTypes(prev => ({
      ...prev,
      [config.selectedSide]: config.enclosureType
    }));
  }
  
  console.log('All AI config applied successfully!');
};
// ============================================
// ALSO UPDATE THE sideEnclosureTypes IF NEEDED
// ============================================

// If you want to handle side enclosure types from AI:


  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <>
      {!loaded && <LoadingScreen />}
      
 <AIAssistantModal  
  show={showAIModal}
  onClose={() => setShowAIModal(false)}
  onApplyConfig={handleApplyAIConfig}
/>
      <div className={`${styles.verandaConfigurator} ${isMobile ? styles.mobile : ''}`}>
        <div className={`${styles.canvasContainer} ${isMobile ? styles.mobile : ''}`}>
          <TimeToggle timeOfDay={timeOfDay} setTimeOfDay={setTimeOfDay} />
            {/* <CameraModeToggle cameraMode={cameraMode} setCameraMode={setCameraMode} /> */}
          <Suspense fallback={null}>
            <Canvas
              shadows
              camera={{ position: [8, 5, 8], fov: 50 }}
              onCreated={() => setLoaded(true)}
              gl={{ antialias: true, alpha: true }}
            >
              <color attach="background" args={[timeOfDay === 'night' ? '#0a0f1e' : '#f6f6f6']} />
              
              <ambientLight intensity={timeOfDay === 'night' ? 0.2 : 0.5} />
              <directionalLight
                position={[10, 10, 5]}
                intensity={timeOfDay === 'night' ? 0.3 : 0.9}
                castShadow
                shadow-mapSize={[2048, 2048]}
              />
              <hemisphereLight intensity={timeOfDay === 'night' ? 0.1 : 0.4} groundColor="#444444" />

              <Environment files={timeOfDay === 'night' ? './solitude_night_1k.hdr' : './golden_gate_hills_1k.hdr'} background={true}  environmentIntensity={timeOfDay === 'night' ? 0.3 : 3.2}/>
              
              <TexturedGround />
              
              <ContactShadows
                position={[0, 0, 0]}
                opacity={timeOfDay === 'night' ? 0.2 : 0.3}
                scale={20}
                blur={2}
                far={4}
              />

      <Suspense fallback={null}>

  <HouseModel 
    verandaType={verandaType} 
    width={width} 
    depth={depth} 
    height={height}  
    houseType={houseType}
  />
</Suspense>
{/* <HeartPathVisualizer /> */}
              <Suspense fallback={null}>
                <VerandaModel 
                  roofPitchActive={roofPitchActive}
                  roofPitchAngle={roofPitchAngle}
                  roofAwningPosition={roofAwningPosition}
                  metalMaterial={metalMaterial}
                  enclosureType={enclosureType}
                  enclosureEnabled={enclosureEnabled}
                  selectedSide={selectedSide}
                  lightsOn={lightsOn}
                  lightShape={lightShape}
                  timeOfDay={timeOfDay}
                  lightColor={lightColor}
                  glassType={glassType}
                  glassStyle={glassStyle}
                  width={width}
                  depth={depth}
                  height={height}
                  sideEnclosureTypes={sideEnclosureTypes}
                  verandaType={verandaType}
glassColor={glassColor}
tintedGlassEnabled={tintedGlassEnabled} 
                />

              </Suspense>
 {/* <CameraAngleDisplay /> */}
              <CameraController enclosureView={enclosureView} verandaType={verandaType}   />
            </Canvas>
          </Suspense>
        </div>

        <ConfigurationPanel 
          isMobile={isMobile}
          roofPitchActive={roofPitchActive}
          setRoofPitchActive={setRoofPitchActive}
          roofPitchAngle={roofPitchAngle}
          setRoofPitchAngle={setRoofPitchAngle}
          roofAwningPosition={roofAwningPosition}
          setRoofAwningPosition={setRoofAwningPosition}
          metalMaterial={metalMaterial}
          setMetalMaterial={setMetalMaterial}
          enclosureEnabled={enclosureEnabled}
          setEnclosureEnabled={setEnclosureEnabled}
          enclosureType={enclosureType}
          setEnclosureType={handleEnclosureTypeChange}
            houseType={houseType}                           // 🆕 ADD THIS
  onHouseTypeChange={handleHouseTypeChange}       // 🆕 ADD THIS
  leftWallOption={leftWallOption}                 // 🆕 ADD THIS
  setLeftWallOption={setLeftWallOption}           // 🆕 ADD THIS
  rightWallOption={rightWallOption}               // 🆕 ADD THIS
  setRightWallOption={setRightWallOption}         // 🆕 ADD THIS
  showLeftFence={showLeftFence}                   // 🆕 ADD THIS
  showRightFence={showRightFence}                 // 🆕 ADD THIS
          glassType={glassType}
          setGlassType={setGlassType}
          glassStyle={glassStyle}
          setGlassStyle={setGlassStyle}
          selectedSide={selectedSide}
          setSelectedSide={setSelectedSide}
          lightsOn={lightsOn}
          setLightsOn={setLightsOn}
          lightShape={lightShape}
          setLightShape={setLightShape}
          lightColor={lightColor}
          setLightColor={setLightColor}
          setEnclosureView={setEnclosureView}
          width={width}
          setWidth={setWidth}
          depth={depth}
          setDepth={setDepth}
          height={height}
          setHeight={setHeight}
          verandaType={verandaType}
          setVerandaType={setVerandaType}
          showAIModal={showAIModal}
          setShowAIModal={setShowAIModal}
          pricing={pricing}
           sideEnclosureTypes={sideEnclosureTypes}          // 🆕 ADD
  setSideEnclosureTypes={setSideEnclosureTypes}    // 🆕 ADD
  tintedGlassEnabled={tintedGlassEnabled}          // 🆕 ADD
  setTintedGlassEnabled={setTintedGlassEnabled}    // 🆕 ADD
  glassColor={glassColor}                          // 🆕 ADD
  setGlassColor={setGlassColor}                    // 🆕 ADD
        />
      </div>
    </>
  );
};

export default VerandaConfiguratorFinal;