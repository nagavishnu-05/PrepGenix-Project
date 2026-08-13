import React, { useState, useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Shield, Clock, FileCode, AlertTriangle, Camera, Mic, Monitor, ChevronRight, } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { useTestStore } from "@/store/test-store";
import { mockTests } from "@/lib/mock-data";
import { api } from "@/lib/api";
import { formatDuration, cn } from "@/lib/utils";
import { CodingEnvironment } from "@/components/assessment/coding-environment";
export default function AssessmentPage() {
    const { testId } = useParams();
    const navigate = useNavigate();
    const { setCurrentTest, setTimeRemaining, setCurrentQuestion, setCurrentAttempt } = useTestStore();
    const [isStarted, setIsStarted] = useState(false);
    const [consentGiven, setConsentGiven] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [cameraConsent, setCameraConsent] = useState(false);
    const [micConsent, setMicConsent] = useState(false);
    const [screenConsent, setScreenConsent] = useState(false);
    const test = mockTests.find((t) => t.id === testId);
    useEffect(() => {
        if (test) {
            setCurrentTest(test);
            setTimeRemaining(test.duration * 60);
            if (test.questions.length > 0) {
                setCurrentQuestion(test.questions[0]);
            }
        }
    }, [test, setCurrentTest, setTimeRemaining, setCurrentQuestion]);
    const allConsented = consentGiven && cameraConsent && micConsent && screenConsent;
    const handleStartAssessment = useCallback(async () => {
        if (!test || !allConsented)
            return;
        setIsLoading(true);
        try {
            const attempt = await api.attempts.start(test.id);
            setCurrentAttempt(attempt);
            setIsStarted(true);
        }
        catch {
            // fail silently in demo
        }
        finally {
            setIsLoading(false);
        }
    }, [test, allConsented, setCurrentAttempt]);
    if (!test) {
        return (<div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto"/>
          <h2 className="text-xl font-semibold text-zinc-100">Test Not Found</h2>
          <p className="text-sm text-zinc-400">The requested assessment could not be found.</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </div>
      </div>);
    }
    if (isStarted) {
        return <CodingEnvironment testId={testId}/>;
    }
    return (<div className="min-h-screen bg-zinc-950">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-8">
          {/* Header */}
          <div className="space-y-4">
            <Badge variant="info" className="gap-1">
              <Shield className="h-3 w-3"/>
              Proctored Assessment
            </Badge>
            <h1 className="text-3xl font-bold text-zinc-100">{test.title}</h1>
            <p className="text-zinc-400 leading-relaxed">{test.description}</p>
          </div>

          <Separator className="bg-zinc-800"/>

          {/* Test Info Grid */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-violet-500/10 p-2">
                  <Clock className="h-5 w-5 text-violet-400"/>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Duration</p>
                  <p className="text-sm font-semibold text-zinc-100">
                    {formatDuration(test.duration)}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-indigo-500/10 p-2">
                  <FileCode className="h-5 w-5 text-indigo-400"/>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Questions</p>
                  <p className="text-sm font-semibold text-zinc-100">
                    {test.questions.length}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2">
                  <Shield className="h-5 w-5 text-emerald-400"/>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Total Points</p>
                  <p className="text-sm font-semibold text-zinc-100">{test.totalPoints}</p>
                </div>
              </div>
            </Card>

            <Card className="border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-500/10 p-2">
                  <AlertTriangle className="h-5 w-5 text-amber-400"/>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Passing Score</p>
                  <p className="text-sm font-semibold text-zinc-100">{test.passingScore}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Rules */}
          <Card className="border-zinc-800 bg-zinc-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-zinc-100">Rules & Guidelines</h3>
            <ul className="space-y-3">
              {[
            "Tab switching and window switching are monitored and will be flagged as violations",
            "Copy-paste operations are disabled during the assessment",
            "Developer tools (F12) and keyboard shortcuts are restricted",
            "Camera and microphone monitoring is active throughout the assessment",
            "Right-click context menu is disabled",
            "Maximum of " + test.maxViolations + " violations allowed before auto-submission",
            "Test will auto-submit when the timer reaches zero",
        ].map((rule, i) => (<li key={i} className="flex items-start gap-3 text-sm text-zinc-400">
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600"/>
                  {rule}
                </li>))}
            </ul>
          </Card>

          {/* Privacy Notice */}
          <Card className="border-zinc-800 bg-zinc-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-zinc-100">Privacy Notice</h3>
            <p className="mb-4 text-sm text-zinc-400 leading-relaxed">
              This assessment requires access to your camera, microphone, and screen for
              proctoring purposes. Your data is encrypted and used solely for assessment
              integrity verification.
            </p>

            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer group">
                <Checkbox checked={consentGiven} onCheckedChange={(checked) => setConsentGiven(checked === true)}/>
                <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">
                  I understand and consent to proctoring during this assessment
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <Checkbox checked={cameraConsent} onCheckedChange={(checked) => setCameraConsent(checked === true)}/>
                <div className="flex items-center gap-2">
                  <Camera className="h-3.5 w-3.5 text-zinc-500"/>
                  <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">
                    I consent to camera access for identity verification
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <Checkbox checked={micConsent} onCheckedChange={(checked) => setMicConsent(checked === true)}/>
                <div className="flex items-center gap-2">
                  <Mic className="h-3.5 w-3.5 text-zinc-500"/>
                  <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">
                    I consent to microphone access for audio monitoring
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer group">
                <Checkbox checked={screenConsent} onCheckedChange={(checked) => setScreenConsent(checked === true)}/>
                <div className="flex items-center gap-2">
                  <Monitor className="h-3.5 w-3.5 text-zinc-500"/>
                  <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">
                    I consent to screen monitoring for exam integrity
                  </span>
                </div>
              </label>
            </div>
          </Card>

          {/* Start Button */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="flex justify-center">
            <Button variant="gradient" size="lg" onClick={handleStartAssessment} disabled={!allConsented || isLoading} className={cn("min-w-[240px] text-base", !allConsented && "opacity-50 cursor-not-allowed")}>
              {isLoading ? (<span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"/>
                  Preparing...
                </span>) : (<>
                  <Shield className="h-5 w-5 mr-2"/>
                  Start Assessment
                </>)}
            </Button>
          </motion.div>

          {!allConsented && (<p className="text-center text-xs text-zinc-600">
              Please accept all consent checkboxes to begin the assessment
            </p>)}
        </motion.div>
      </div>
    </div>);
}
