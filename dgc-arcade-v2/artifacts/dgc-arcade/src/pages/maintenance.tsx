export default function Maintenance() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f7f7f7] text-[#333] font-sans p-8 text-center">
      <div className="max-w-xl w-full">
        <div className="mb-8 flex justify-center">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </div>
        
        <h1 className="text-4xl font-bold mb-6 text-gray-900">Site Maintenance</h1>
        <p className="text-xl text-[#666] mb-8 leading-relaxed">
          We're currently performing some scheduled maintenance to improve your experience. 
          We'll be back online shortly. Thank you for your patience!
        </p>
        
        <div className="inline-block px-4 py-2 bg-amber-100 border border-amber-200 rounded-lg text-amber-800 text-sm font-medium">
          Scheduled updates in progress
        </div>
      </div>
    </div>
  );
}
