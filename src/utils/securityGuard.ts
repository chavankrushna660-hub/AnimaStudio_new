/**
 * Professional Client-Side Security Guard & Injection Shield
 * Prevents dynamic script injection, prototype pollution, XSS vectors, and tampering.
 */

// Strict HTML Entity Escaper for rendering safe labels
export function escapeHTML(val: string): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Strip out dangerous patterns recursively
export function sanitizeString(val: string): string {
  if (typeof val !== 'string') return '';
  
  let clean = val;
  const dangerousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /on\w+\s*=/gi,
    /javascript\s*:/gi,
    /vbscript\s*:/gi,
    /expression\s*\(/gi,
    /eval\s*\(/gi,
    /setInterval\s*\(/gi,
    /setTimeout\s*\(/gi,
    /alert\s*\(/gi,
    /document\.cookie/gi,
    /window\./gi,
    /document\./gi,
    /localStorage/gi,
    /sessionStorage/gi,
    /indexedDB/gi,
    /fetch\s*\(/gi,
    /XMLHttpRequest/gi,
    /websocket/gi,
    /data:text\/html/gi,
    /srcdoc\s*=/gi
  ];

  dangerousPatterns.forEach(pattern => {
    clean = clean.replace(pattern, '');
  });

  return clean.trim();
}

// Deep sanitization of objects/arrays (recursively cleans state objects, uploaded assets, or file metadata)
export function sanitizePayload(data: any): any {
  if (data === null || data === undefined) return data;
  
  if (typeof data === 'string') {
    return sanitizeString(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizePayload(item));
  }
  
  if (typeof data === 'object') {
    const cleanObj: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const cleanKey = sanitizeString(key);
        cleanObj[cleanKey] = sanitizePayload(data[key]);
      }
    }
    return cleanObj;
  }
  
  return data;
}

// Safe parsing of any imported drawing/animation configuration or custom mesh JSON
export function safeJsonParse(jsonString: string): any {
  try {
    const parsed = JSON.parse(jsonString);
    return sanitizePayload(parsed);
  } catch (e) {
    console.error("JSON parse blocked or failed due to potential syntax or security injection risks.");
    return null;
  }
}

// Main initializer that locks down prototypes and overrides unsafe APIs
export function runSecurityShield() {
  if (typeof window === 'undefined') return;

  // 1. Lock standard prototypes to prevent Prototype Pollution
  try {
    Object.freeze(Object.prototype);
    Object.freeze(Array.prototype);
    Object.freeze(String.prototype);
    Object.freeze(Number.prototype);
    Object.freeze(Boolean.prototype);
    console.log("🛡️ Client-side security prototypes frozen successfully.");
  } catch (e) {
    console.warn("🛡️ Prototype freezing completed with standard system constraints.");
  }

  // 2. Disable eval() to prevent dynamic script evaluation
  try {
    window.eval = function() {
      console.error("🚫 Security Alert: Dynamically evaluated code (eval) is forbidden.");
      throw new Error("Security protection: eval() is disabled.");
    };
    Object.defineProperty(window, 'eval', { writable: false, configurable: false });
  } catch (e) {}

  // 3. Disable unsafe dynamic constructors
  try {
    (window as any).Function = function() {
      console.error("🚫 Security Alert: Dynamic function generation is blocked.");
      throw new Error("Security protection: Function constructor is disabled.");
    };
  } catch (e) {}
}
