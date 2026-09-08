import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import PwaManager from './PwaManager'
import './styles.css'

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } })
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={client}><App /><PwaManager /><Toaster position="bottom-right" theme="dark" visibleToasts={3} closeButton /></QueryClientProvider></React.StrictMode>)
