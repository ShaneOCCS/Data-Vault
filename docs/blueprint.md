# **App Name**: StudentAuth Portal

## Core Features:

- Secure Student Registration: Allows students to link their Student ID with a temporary registration code provided by the school for initial authenticator setup.
- Authenticator QR Code Generation: Generates a unique Time-Based One-Time Password (TOTP) secret and a scannable QR code for students to easily provision their authenticator app.
- Student Secret Management: Securely stores and manages the generated TOTP secrets associated with individual student IDs for authentication purposes.
- Authenticator-Based Login Interface: Provides a user-friendly interface for students to enter their Student ID and the 6-digit code from their Microsoft Authenticator app.
- TOTP Code Verification System: Verifies the entered authenticator code against the securely stored TOTP secret to grant or deny access.

## Style Guidelines:

- Color Palette Rationale: Inspired by the concepts of 'security,' 'reliability,' and 'educational clarity,' a calm and professional light color scheme is chosen to evoke trust and ease of use. A dependable blue serves as the primary, balanced by a near-white background and a contrasting cyan accent.
- Primary Color: A solid and trustworthy medium blue (#2E78CC) selected for headings, important text, and interactive elements. Its balanced saturation and lightness ensure readability against various backgrounds.
- Background Color: A very subtle blue-tinted off-white (#F4F6F9) that provides a clean, open, and professional canvas, reducing visual fatigue and enhancing content readability.
- Accent Color: A clear and bright cyan (#40CAE5) for call-to-action buttons, highlights, and secondary interactive elements, providing a pleasant visual contrast while maintaining a harmonious analogous relationship with the primary blue.
- Headline and Body Font: 'Inter' (sans-serif) is chosen for its modern, neutral, and highly legible design, ensuring clarity and professionalism across all textual content, which is crucial for a portal handling secure student information.
- Icon Style: Utilize clean, outline-style icons that are universally recognized for concepts like security, identity, settings, and authentication. Icons should be minimalistic and align with the modern and professional aesthetic.
- Layout Structure: Implement a clean, well-organized layout with a strong emphasis on user focus. Use clear sectioning and ample whitespace to guide the user through the login and registration processes. Ensure responsiveness for a seamless experience on both desktop and mobile devices.
- Animation Philosophy: Subtle and functional animations will be employed to provide positive feedback for user actions, such as form submissions, successful login, or QR code generation. These animations should be fast and unintrusive, enhancing user experience without causing distractions.