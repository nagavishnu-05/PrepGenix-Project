import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, } from "recharts";
export default function ViolationChart({ data, height = 300 }) {
    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length)
            return null;
        return (<div className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 shadow-xl">
        <p className="mb-2 text-xs font-medium text-zinc-400">{label}</p>
        {payload.map((entry, index) => (<div key={index} className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }}/>
            <span className="text-xs text-zinc-500">{entry.name}:</span>
            <span className="text-sm font-semibold text-zinc-100">
              {entry.value}
            </span>
          </div>))}
      </div>);
    };
    return (<div className="space-y-3">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a"/>
          <XAxis dataKey="time" tick={{ fill: "#71717a", fontSize: 12 }} axisLine={{ stroke: "#27272a" }} tickLine={false}/>
          <YAxis tick={{ fill: "#71717a", fontSize: 12 }} axisLine={false} tickLine={false}/>
          <Tooltip content={<CustomTooltip />}/>
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", color: "#a1a1aa" }}/>
          <Area type="monotone" dataKey="tabSwitch" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} name="Tab Switches"/>
          <Area type="monotone" dataKey="faceDetected" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} name="Face Events"/>
          <Area type="monotone" dataKey="audioEvents" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} name="Audio Events"/>
        </AreaChart>
      </ResponsiveContainer>
    </div>);
}
