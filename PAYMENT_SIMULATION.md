# Payment Simulation Documentation

## Overview
This music marketplace now includes a dummy payment simulation system for university project demonstration purposes. No real money is processed or transferred.

## Features

### Payment Modal
- Professional payment form with card number, expiry date, CVV, cardholder name, and email fields
- Real-time form validation
- Visual feedback during processing simulation
- University project disclaimer clearly displayed

### Price Structure
- All tracks (both Spotify and user-uploaded) cost **£0.99**
- Price is displayed on all purchase buttons
- Fixed pricing for simplicity

### Payment Flow
1. User clicks "Purchase £0.99" button on any track
2. Payment modal opens with song details and price summary
3. User fills in dummy payment details:
   - Card Number: Any 16-digit number (e.g., 1234 5678 9012 3456)
   - Expiry Date: Any future date in MM/YY format
   - CVV: Any 3-digit number
   - Cardholder Name: Any name
   - Email: Valid email format
4. Form validation ensures all fields are properly filled
5. "Processing..." animation simulates payment gateway communication
6. Success confirmation shows purchase completion

### Backend Logging
The backend logs all simulated payments with:
- User ID
- Song ID
- Price (£0.99)
- Payment details (when provided)
- Timestamp

### Safety Features
- Clear university project disclaimers
- No real payment gateway integration
- All transactions marked as dummy/simulation
- Console logging for demonstration purposes

## API Endpoints

### POST /api/purchase
**Request:**
```json
{
  "userId": "user123",
  "songId": "song456",
  "paymentData": {
    "paymentId": "PAY_1234567890",
    "amount": 0.99,
    "currency": "GBP",
    "cardLast4": "3456",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response:**
```json
{
  "id": "purchase_id",
  "userId": "user123",
  "songId": "song456",
  "purchasedAt": "2024-01-15T10:30:00.000Z",
  "price": 0.99,
  "currency": "GBP",
  "paymentStatus": "completed",
  "message": "Purchase successful - this is a dummy transaction for university project"
}
```

## Testing
1. Start both backend and frontend servers
2. Navigate to the Music Catalogue
3. Log in with any valid account
4. Click "Purchase £0.99" on any track
5. Fill in the payment form with dummy data
6. Complete the purchase simulation
7. Check browser console and backend logs for transaction details

## Notes
- This is purely educational and demonstrates e-commerce payment flows
- No actual payment processing occurs
- All card numbers and payment details are dummy data
- The system simulates successful payments for demonstration purposes








