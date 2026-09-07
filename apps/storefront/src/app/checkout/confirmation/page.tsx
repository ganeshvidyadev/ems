import type { Metadata } from 'next';
import { ConfirmationView } from '@/components/confirmation-view';

export const metadata: Metadata = {
  title: 'Order confirmed',
  robots: { index: false, follow: false },
};

export default function ConfirmationPage() {
  return (
    <div className="py-6">
      <ConfirmationView />
    </div>
  );
}
