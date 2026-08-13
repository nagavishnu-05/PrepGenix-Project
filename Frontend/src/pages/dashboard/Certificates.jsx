import { motion } from "framer-motion";
import { Award, Download, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockCertificates } from "@/lib/mock-data";
import { formatDate } from "@/lib/utils";
export default function CertificatesPage() {
    return (<div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-zinc-100">My Certificates</h1>
        <p className="text-zinc-400">Download and manage your earned certificates.</p>
      </motion.div>

      {mockCertificates.length > 0 ? (<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {mockCertificates.map((cert, i) => (<motion.div key={cert.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1, duration: 0.4 }}>
              <Card className="group overflow-hidden transition-all hover:border-zinc-700">
                {/* Certificate header gradient */}
                <div className="h-32 bg-gradient-to-br from-violet-600/20 via-indigo-600/20 to-zinc-900 flex items-center justify-center relative">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 shadow-lg shadow-violet-500/20">
                    <Award className="h-8 w-8 text-white"/>
                  </div>
                  <div className="absolute top-3 right-3">
                    <Badge variant="success">Verified</Badge>
                  </div>
                </div>

                <CardContent className="space-y-4 p-6">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-100">
                      {cert.testName}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-400">
                      Issued on {formatDate(cert.issuedAt)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/30 p-3">
                    <span className="text-sm text-zinc-400">Score</span>
                    <span className="text-lg font-bold text-zinc-100">
                      {cert.score}%
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="gradient" className="flex-1" size="sm">
                      <Download className="h-4 w-4"/>
                      Download
                    </Button>
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-4 w-4"/>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>))}
        </div>) : (<motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-800/50">
                <Award className="h-10 w-10 text-zinc-500"/>
              </div>
              <h3 className="mt-6 text-lg font-medium text-zinc-300">
                No certificates yet
              </h3>
              <p className="mt-2 max-w-sm text-sm text-zinc-500">
                Complete and pass an assessment to earn your first certificate.
              </p>
              <Button variant="gradient" className="mt-6">
                Browse Assessments
              </Button>
            </CardContent>
          </Card>
        </motion.div>)}
    </div>);
}
