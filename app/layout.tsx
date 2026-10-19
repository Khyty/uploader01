import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'បញ្ញើ · Pannheu — Share simply', description: 'A little space to share. Secure, temporary file sharing.', manifest:'/manifest.webmanifest', appleWebApp:{capable:true,title:'Pannheu',statusBarStyle:'default'} };
export const viewport: Viewport = {themeColor:'#faf9f6',width:'device-width',initialScale:1};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="km"><body>{children}</body></html>; }
