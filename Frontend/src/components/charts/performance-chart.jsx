import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, } from "recharts";
export default function PerformanceChart({ data, title, type = "line", xKey = "month", yKey = "score", color = "#8b5cf6", height = 300, }) {
    const CustomTooltip = ({ active, payload, label }) => {
        if (!active || !payload?.length)
            return null;
        return (<div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 shadow-xl">
        <p className="text-xs font-medium text-zinc-400">{label}</p>
        {payload.map((entry, index) => (<p key={index} className="text-sm font-semibold text-zinc-100">
            {entry.name}: {entry.value}
          </p>))}
      </div>);
    };
    const renderChart = () => {
        const commonProps = {
            data,
            margin: { top: 5, right: 10, left: -10, bottom: 5 },
        };
        const axisProps = {
            xAxis: {
                dataKey: xKey,
                tick: { fill: "#71717a", fontSize: 12 },
                axisLine: { stroke: "#27272a" },
                tickLine: false,
            },
            yAxis: {
                tick: { fill: "#71717a", fontSize: 12 },
                axisLine: false,
                tickLine: false,
            },
        };
        switch (type) {
            case "area":
                return (<AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a"/>
            <XAxis {...axisProps.xAxis}/>
            <YAxis {...axisProps.yAxis}/>
            <Tooltip content={<CustomTooltip />}/>
            <Area type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} fill={color} fillOpacity={0.1}/>
          </AreaChart>);
            case "bar":
                return (<BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a"/>
            <XAxis {...axisProps.xAxis}/>
            <YAxis {...axisProps.yAxis}/>
            <Tooltip content={<CustomTooltip />}/>
            <Bar dataKey={yKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={40}/>
          </BarChart>);
            default:
                return (<LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a"/>
            <XAxis {...axisProps.xAxis}/>
            <YAxis {...axisProps.yAxis}/>
            <Tooltip content={<CustomTooltip />}/>
            <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={{ fill: color, strokeWidth: 0, r: 4 }} activeDot={{ r: 6, strokeWidth: 0 }}/>
          </LineChart>);
        }
    };
    return (<div className="space-y-3">
      <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
    </div>);
}
