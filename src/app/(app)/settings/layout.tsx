import { SettingsTopbar } from "./settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-app">
      <SettingsTopbar />
      <div className="min-h-0 flex-1 overflow-y-auto max-md:overscroll-contain">
        <div className="mx-auto w-full max-w-[1120px] p-8 max-md:px-4 max-md:pt-4 max-md:pb-8">{children}</div>
      </div>
    </div>
  );
}
