import { useEffect, useState } from "react";
import { AlertTriangle, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
export function FullscreenGuard({ children }) {
    const [isFullscreen, setIsFullscreen] = useState(true);
    useEffect(() => {
        const checkFullscreen = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", checkFullscreen);
        checkFullscreen();
        return () => document.removeEventListener("fullscreenchange", checkFullscreen);
    }, []);
    const enterFullscreen = async () => {
        try {
            await document.documentElement.requestFullscreen();
        }
        catch { }
    };
    return (<>
      <AnimatePresence>
        {!isFullscreen && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-zinc-950/95 backdrop-blur-xl flex items-center justify-center">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-md">
              <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="h-10 w-10 text-amber-400"/>
              </div>
              <h2 className="text-2xl font-bold text-zinc-100 mb-3">Fullscreen Required</h2>
              <p className="text-zinc-400 mb-8">
                This assessment requires fullscreen mode to maintain exam integrity.
                Please click the button below to continue.
              </p>
              <Button onClick={enterFullscreen} variant="gradient" size="lg">
                <Maximize className="h-5 w-5 mr-2"/>
                Enter Fullscreen
              </Button>
            </motion.div>
          </motion.div>)}
      </AnimatePresence>
      {children}
    </>);
}
