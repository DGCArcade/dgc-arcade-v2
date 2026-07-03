import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f7f7f7] text-[#333] font-sans p-8">
      <div className="max-w-xl w-full">
        <div className="mb-8">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        
        <h1 className="text-3xl font-normal mb-4">This site can't be reached</h1>
        <p className="text-lg text-[#666] mb-8">
          The webpage at <span className="font-bold">{window.location.href}</span> might be temporarily down or it may have moved permanently to a new web address.
        </p>
        
        <div className="space-y-4 mb-12">
          <p className="text-sm text-[#666] font-bold uppercase tracking-wider">ERR_CONNECTION_REFUSED</p>
          <div className="h-px bg-[#ddd] w-full" />
        </div>

        <Button 
          variant="outline" 
          className="rounded-sm border-[#ccc] text-[#333] hover:bg-[#eee] px-8"
          onClick={() => window.location.href = "/"}
        >
          Reload
        </Button>
      </div>
    </div>
  );
}
