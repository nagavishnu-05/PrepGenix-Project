import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCamera } from "@/hooks/use-camera";
import { Minimize2, Maximize2, Video, VideoOff, RefreshCw, } from "lucide-react";
export function ProctoringPanel() {
    const [isMinimized, setIsMinimized] = useState(false);
    const { videoRef, isActive, startCamera, stopCamera, error } = useCamera();
    useEffect(() => {
        const timer = setTimeout(() => {
            startCamera();
        }, 500);
        return () => {
            clearTimeout(timer);
            stopCamera();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return (<motion.div initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="fixed bottom-4 right-4 z-50">
      <Card className="border-zinc-800 bg-zinc-900/95 backdrop-blur-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${isActive ? "bg-emerald-500" : error ? "bg-red-500" : "bg-amber-500"}`}/>
              <span className="text-xs font-medium text-zinc-400">
                {isActive ? "Camera Active" : error ? "Camera Error" : "Initializing..."}
              </span>
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsMinimized(!isMinimized)}>
            {isMinimized ? <Maximize2 className="h-3 w-3"/> : <Minimize2 className="h-3 w-3"/>}
          </Button>
        </div>

        <AnimatePresence>
          {!isMinimized && (<motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="relative aspect-[4/3] w-64 bg-zinc-950">
                {error ? (<div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-500 p-4">
                    <VideoOff className="h-8 w-8 text-red-400"/>
                    <span className="text-xs text-center text-red-400">{error}</span>
                  </div>) : isActive ? (<video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover"/>) : (<div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-600">
                    <div className="h-8 w-8 animate-pulse rounded-full border-2 border-zinc-700 border-t-zinc-400"/>
                    <span className="text-xs">Starting camera...</span>
                  </div>)}
              </div>
              <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800">
                {error ? (<Button variant="outline" size="sm" className="text-xs h-7" onClick={() => startCamera()}>
                    <RefreshCw className="h-3 w-3 mr-1"/>
                    Retry Camera
                  </Button>) : (<Button variant="outline" size="sm" className="text-xs h-7" onClick={() => {
                    if (isActive)
                        stopCamera();
                    else
                        startCamera();
                }}>
                    {isActive ? (<>
                        <VideoOff className="h-3 w-3 mr-1"/>
                        Stop
                      </>) : (<>
                        <Video className="h-3 w-3 mr-1"/>
                        Start
                      </>)}
                  </Button>)}
              </div>
            </motion.div>)}
        </AnimatePresence>
      </Card>
    </motion.div>);
}
