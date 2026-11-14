/**
 * ⚠️ ROUTING RULES:
 * - Routes are defined here using <Routes> and <Route>.
 * - <BrowserRouter> is already in main.tsx — do NOT add another one.
 * - Use `import { ... } from 'react-router'` (NOT 'react-router-dom').
 * - Use static imports only. Do NOT use React.lazy().
 */

import { Routes, Route } from 'react-router';
import Index from '@/pages/Index';
import SendTicket from '@/pages/SendTicket';

export default function App() {
	return (
		<Routes>
			<Route path="/" element={<SendTicket />} />
			<Route path="/dashboard" element={<Index />} />
		</Routes>
	);
}
