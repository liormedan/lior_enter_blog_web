import { NextRequest, NextResponse } from 'next/server'
import { ContactFormData } from '@/types/landing-page'

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Input sanitization function
function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 1000) // Limit length
}

// Validation functions
function validateContactForm(data: unknown): { isValid: boolean; errors: string[] } {
  const errors: string[] = []

  // Type guard to check if data is an object
  if (!data || typeof data !== 'object') {
    errors.push('נתונים לא תקינים')
    return { isValid: false, errors }
  }

  const formData = data as Record<string, unknown>

  // Check required fields
  if (!formData.name || typeof formData.name !== 'string') {
    errors.push('שם מלא הוא שדה חובה')
  } else if (formData.name.trim().length < 2) {
    errors.push('שם חייב להכיל לפחות 2 תווים')
  }

  if (!formData.email || typeof formData.email !== 'string') {
    errors.push('כתובת אימייל היא שדה חובה')
  } else if (!EMAIL_REGEX.test(formData.email)) {
    errors.push('כתובת אימייל לא תקינה')
  }

  if (!formData.projectType || typeof formData.projectType !== 'string') {
    errors.push('יש לבחור סוג פרויקט')
  }

  if (!formData.message || typeof formData.message !== 'string') {
    errors.push('הודעה היא שדה חובה')
  } else if (formData.message.trim().length < 10) {
    errors.push('הודעה חייבת להכיל לפחות 10 תווים')
  }

  return {
    isValid: errors.length === 0,
    errors
  }
}

// Email sending function using fetch to a service like Resend, SendGrid, or similar
async function sendEmail(formData: ContactFormData): Promise<void> {
  const emailService = process.env.EMAIL_SERVICE || 'console'
  
  if (emailService === 'console') {
    // For development - log to console
    console.log('📧 New Contact Form Submission:')
    console.log('Name:', formData.name)
    console.log('Email:', formData.email)
    console.log('Project Type:', formData.projectType)
    console.log('Selected Package:', formData.selectedPackage || 'None')
    console.log('Message:', formData.message)
    console.log('---')
    return
  }

  // For production - you would implement actual email sending here
  // Example with Resend API:
  /*
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL || 'noreply@yourdomain.com',
      to: process.env.TO_EMAIL || 'contact@yourdomain.com',
      subject: `פנייה חדשה מ-${formData.name} - ${formData.projectType}`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif;">
          <h2>פנייה חדשה מהאתר</h2>
          <p><strong>שם:</strong> ${formData.name}</p>
          <p><strong>אימייל:</strong> ${formData.email}</p>
          <p><strong>סוג פרויקט:</strong> ${formData.projectType}</p>
          ${formData.selectedPackage ? `<p><strong>חבילה נבחרת:</strong> ${formData.selectedPackage}</p>` : ''}
          <p><strong>הודעה:</strong></p>
          <p style="background: #f5f5f5; padding: 15px; border-radius: 5px;">${formData.message}</p>
        </div>
      `,
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to send email')
  }
  */

  // For now, simulate email sending
  await new Promise(resolve => setTimeout(resolve, 1000))
}

// Rate limiting store (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const windowMs = 15 * 60 * 1000 // 15 minutes
  const maxRequests = 5 // Max 5 requests per 15 minutes

  const record = rateLimitStore.get(ip)
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (record.count >= maxRequests) {
    return false
  }

  record.count++
  return true
}

export async function POST(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown'
    
    // Check rate limit
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'יותר מדי בקשות. אנא נסו שוב בעוד 15 דקות.' 
        },
        { status: 429 }
      )
    }

    // Parse request body
    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { 
          success: false, 
          error: 'נתונים לא תקינים' 
        },
        { status: 400 }
      )
    }

    // Validate form data
    const validation = validateContactForm(body)
    if (!validation.isValid) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'נתונים לא תקינים',
          details: validation.errors 
        },
        { status: 400 }
      )
    }

    // Sanitize input data
    const formData = body as Record<string, unknown>
    const sanitizedData: ContactFormData = {
      name: sanitizeInput(String(formData.name)),
      email: sanitizeInput(String(formData.email)),
      projectType: sanitizeInput(String(formData.projectType)),
      message: sanitizeInput(String(formData.message)),
      selectedPackage: formData.selectedPackage ? sanitizeInput(String(formData.selectedPackage)) : undefined
    }

    // Send email
    await sendEmail(sanitizedData)

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'ההודעה נשלחה בהצלחה'
    })

  } catch (error) {
    console.error('Contact form error:', error)
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'אירעה שגיאה בשליחת ההודעה. אנא נסו שוב מאוחר יותר.' 
      },
      { status: 500 }
    )
  }
}

// Handle unsupported methods
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  )
}