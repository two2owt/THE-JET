import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(var(--accent))",
  "hsl(var(--muted))",
];

interface UserGrowthChartProps {
  data: Array<{ date: string; users: number }>;
}

export const UserGrowthChart = ({ data }: UserGrowthChartProps) => (
  <ResponsiveContainer width="100%" height={250}>
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
      <YAxis stroke="hsl(var(--muted-foreground))" />
      <Tooltip
        contentStyle={{
          backgroundColor: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "8px",
        }}
      />
      <Line
        type="monotone"
        dataKey="users"
        stroke="hsl(var(--primary))"
        strokeWidth={2}
        dot={{ fill: "hsl(var(--primary))" }}
      />
    </LineChart>
  </ResponsiveContainer>
);

interface EngagementChartProps {
  data: Array<{ date: string; shares: number; reviews: number }>;
}

export const EngagementChart = ({ data }: EngagementChartProps) => (
  <ResponsiveContainer width="100%" height={250}>
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
      <YAxis stroke="hsl(var(--muted-foreground))" />
      <Tooltip
        contentStyle={{
          backgroundColor: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "8px",
        }}
      />
      <Line
        type="monotone"
        dataKey="shares"
        stroke="hsl(var(--primary))"
        name="Shares"
        strokeWidth={2}
      />
      <Line
        type="monotone"
        dataKey="reviews"
        stroke="hsl(var(--secondary))"
        name="Reviews"
        strokeWidth={2}
      />
    </LineChart>
  </ResponsiveContainer>
);

interface DealTypePieChartProps {
  data: Array<{ type: string; count: number }>;
}

export const DealTypePieChart = ({ data }: DealTypePieChartProps) => (
  <ResponsiveContainer width="100%" height={200}>
    <PieChart>
      <Pie
        data={data}
        dataKey="count"
        nameKey="type"
        cx="50%"
        cy="50%"
        outerRadius={80}
        label={(entry) => `${entry.type}: ${entry.count}`}
      >
        {data.map((_, index) => (
          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip
        contentStyle={{
          backgroundColor: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "8px",
        }}
      />
    </PieChart>
  </ResponsiveContainer>
);

interface LocationActivityChartProps {
  data: Array<{ date: string; locations: number }>;
}

export const LocationActivityChart = ({ data }: LocationActivityChartProps) => (
  <ResponsiveContainer width="100%" height={200}>
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
      <YAxis stroke="hsl(var(--muted-foreground))" />
      <Tooltip
        contentStyle={{
          backgroundColor: "hsl(var(--card))",
          border: "1px solid hsl(var(--border))",
          borderRadius: "8px",
        }}
      />
      <Bar
        dataKey="locations"
        fill="hsl(var(--primary))"
        radius={[8, 8, 0, 0]}
      />
    </BarChart>
  </ResponsiveContainer>
);
