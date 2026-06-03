# TeleVault Pro

Secure, Decentralized Telegram Cloud Storage for encrypted media, folders and off-chain vault management.

## Features

- 🔐 **Secure Authentication**: Telegram API-based authentication with OTP verification
- 📱 **PWA Support**: Install as a standalone app on mobile and desktop
- 🎨 **Modern UI**: Built with Tailwind CSS and Vanilla JavaScript
- 🚀 **Fast Development**: Powered by Vite
- ☁️ **Cloud Integration**: Supabase backend for user management
- 📊 **Gallery Management**: Encrypted media storage and organization

## Tech Stack

- **Frontend**: Vite, Vanilla JavaScript, Tailwind CSS
- **Backend**: Node.js, Express.js
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Telegram Bot API
- **Storage**: Telegram channels

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm or yarn
- Telegram account

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/televault-pro.git
   cd televault-pro/televault
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   
   Then edit `.env` and add your credentials:
   - Get `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from [my.telegram.org](https://my.telegram.org)
   - Get `SUPABASE_URL` and `SUPABASE_ANON_KEY` from [Supabase Console](https://supabase.com)

4. Start the development server:
   ```bash
   npm run dev
   ```
   
   Start the backend:
   ```bash
   npm run start:server
   ```

5. Open `http://localhost:5173` in your browser

## Project Structure

```
televault/
├── index.html          # Main HTML entry point
├── manifest.json       # PWA manifest
├── sw.js              # Service worker for offline support
├── public/            # Static assets (logos, images)
├── src/
│   ├── main.js        # Frontend app
│   ├── counter.js     # (Optional) utility
│   └── style.css      # Styling
├── server.js          # Backend API server
├── package.json       # Dependencies
└── .env.example       # Example environment variables
```

## Scripts

- `npm run dev` - Start Vite dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run start:server` - Start Express backend

## Environment Variables

Create a `.env` file (never commit this):

```env
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
```

See `.env.example` for reference.

## Security

- 🔒 **Never commit `.env` files** containing secrets
- 🔒 **All credentials must be managed via environment variables**
- 🔒 **Backend validates all requests** before accessing sensitive data
- 🔒 **PWA ensures offline functionality** with secure caching

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions, please open an issue on GitHub.
