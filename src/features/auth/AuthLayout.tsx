import type { ReactNode } from "react";
import { AuthHero } from "./AuthHero";

/**
 * Sign-in screens. Phones: brand header above the form. Tablets: the same,
 * with the form in a centered column. Laptops: brand panel beside the form.
 */
export function AuthLayout({
  compact,
  contentKey,
  children,
}: {
  compact: boolean;
  contentKey?: string;
  children: ReactNode;
}) {
  return (
    <div className="no-scrollbar flex h-full flex-col overflow-y-auto bg-canvas lg:flex-row lg:overflow-hidden">
      <AuthHero compact={compact} />
      <div className="no-scrollbar relative -mt-8 flex-1 rounded-t-[32px] bg-canvas px-6 pt-7 pb-8 lg:mt-0 lg:flex lg:flex-col lg:overflow-y-auto lg:rounded-none lg:px-12 lg:py-12">
        <div key={contentKey} className="mx-auto w-full animate-fade-in md:max-w-md lg:my-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
