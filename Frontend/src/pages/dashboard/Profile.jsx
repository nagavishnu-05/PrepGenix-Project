import { useState } from "react";
import { motion } from "framer-motion";
import { User as UserIcon, Mail, Phone, Calendar, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/auth-store";
import { formatDate } from "@/lib/utils";
export default function ProfilePage() {
    const { user } = useAuthStore();
    const [name, setName] = useState(user?.name || "");
    const [email, setEmail] = useState(user?.email || "");
    const [phone, setPhone] = useState("");
    const [notifications, setNotifications] = useState(true);
    const [darkMode, setDarkMode] = useState(true);
    const initials = user?.name
        ? user.name
            .split(" ")
            .map((n) => n[0])
            .join("")
        : "U";
    return (<div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-2xl font-bold text-zinc-100">Profile</h1>
        <p className="text-zinc-400">Manage your account settings and preferences.</p>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column - User Info */}
        <div className="space-y-6 lg:col-span-1">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardContent className="flex flex-col items-center p-8 text-center">
                <Avatar className="h-24 w-24">
                  <AvatarFallback className="bg-gradient-to-br from-violet-500 to-indigo-500 text-2xl font-bold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <h2 className="mt-4 text-xl font-bold text-zinc-100">
                  {user?.name}
                </h2>
                <Badge variant="secondary" className="mt-2 capitalize">
                  <Shield className="mr-1 h-3 w-3"/>
                  {user?.role}
                </Badge>
                <p className="mt-2 text-sm text-zinc-400">{user?.email}</p>
                <div className="mt-4 flex items-center gap-1.5 text-sm text-zinc-500">
                  <Calendar className="h-3.5 w-3.5"/>
                  Member since {formatDate(user?.createdAt || "")}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Stats Summary */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Stats Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Tests Taken</span>
                  <span className="font-semibold text-zinc-100">5</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Average Score</span>
                  <span className="font-semibold text-zinc-100">83%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Certificates</span>
                  <span className="font-semibold text-zinc-100">1</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-400">Leaderboard Rank</span>
                  <span className="font-semibold text-amber-400">#1</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Right Column - Forms */}
        <div className="space-y-6 lg:col-span-2">
          {/* Edit Profile */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Edit Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Full Name</Label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/>
                      <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} className="pl-10"/>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/>
                      <Input id="profile-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10"/>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-phone">Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/>
                    <Input id="profile-phone" type="tel" placeholder="+1 (555) 000-0000" value={phone} onChange={(e) => setPhone(e.target.value)} className="pl-10"/>
                  </div>
                </div>
                <Button variant="gradient">Save Changes</Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Change Password */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Change Password</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input id="current-password" type="password" placeholder="Enter current password"/>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <Input id="new-password" type="password" placeholder="Enter new password"/>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input id="confirm-password" type="password" placeholder="Confirm new password"/>
                  </div>
                </div>
                <Button variant="outline">Update Password</Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* Preferences */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">Email Notifications</p>
                    <p className="text-xs text-zinc-500">
                      Receive email updates about your assessments
                    </p>
                  </div>
                  <Switch checked={notifications} onCheckedChange={setNotifications}/>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">Dark Mode</p>
                    <p className="text-xs text-zinc-500">
                      Use dark theme across the platform
                    </p>
                  </div>
                  <Switch checked={darkMode} onCheckedChange={setDarkMode}/>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>);
}
