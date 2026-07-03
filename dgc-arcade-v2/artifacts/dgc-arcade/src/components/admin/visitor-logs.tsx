import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, RefreshCw, Globe, Smartphone, MapPin, Shield, TrendingUp } from "lucide-react";

interface VisitorLog {
  id: number;
  fingerprint: string | null;
  ip: string;
  deviceType: string;
  os: string | null;
  browser: string | null;
  country: string | null;
  countryCode: string | null;
  city: string | null;
  lat: string | null;
  lon: string | null;
  isVpn: boolean;
  lastPage: string | null;
  visitCount: number;
  createdAt: string;
  updatedAt: string;
}

interface VisitorStats {
  totalVisitors: number;
  uniqueIps: number;
  vpnDetected: number;
  topCountries: { country: string; count: number }[];
  topDevices: { deviceType: string; count: number }[];
}

export function VisitorLogs() {
  const [logs, setLogs] = useState<VisitorLog[]>([]);
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const limit = 50;

  const fetchLogs = async (searchQuery = "", pageOffset = 0) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("dgc_token");
      const res = await fetch(
        `/api/admin/visitor-logs?search=${encodeURIComponent(searchQuery)}&limit=${limit}&offset=${pageOffset}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (res.ok) {
        setLogs(data.logs);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to fetch visitor logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem("dgc_token");
      const res = await fetch("/api/admin/visitor-logs/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setStats(data);
    } catch (err) {
      console.error("Failed to fetch visitor stats:", err);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    setOffset(0);
    fetchLogs(value, 0);
  };

  const handleRefresh = () => {
    fetchLogs(search, offset);
    fetchStats();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display font-black text-2xl uppercase tracking-widest">Visitor Logs</h2>
          <p className="text-xs text-muted-foreground font-mono mt-1">Track all site visitors, including non-registered users</p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={loading}
          className="flex items-center gap-2 font-bold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                <Globe className="w-3.5 h-3.5" />
                Total Visitors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono font-black text-2xl">{stats.totalVisitors}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                <Smartphone className="w-3.5 h-3.5" />
                Unique IPs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono font-black text-2xl">{stats.uniqueIps}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border border-amber-500/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                VPN Detected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono font-black text-2xl text-amber-400">{stats.vpnDetected}</div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                Top Country
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono font-black text-lg">
                {stats.topCountries[0]?.country?.slice(0, 15) ?? "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stats.topCountries[0]?.count ?? 0} visitors</p>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                Top Device
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-mono font-black text-lg capitalize">
                {stats.topDevices[0]?.deviceType ?? "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stats.topDevices[0]?.count ?? 0} users</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by IP, city, country, or device type…"
          value={search}
          onChange={handleSearch}
          className="pl-10"
        />
      </div>

      {/* Table */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/40 hover:bg-transparent">
                <TableHead className="text-xs uppercase tracking-wider font-bold">IP Address</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-bold">Device</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-bold">Location</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-bold">VPN</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-bold">Last Page</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-bold">Visits</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-bold">Last Seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id} className="border-border/40 hover:bg-secondary/30">
                  <TableCell className="font-mono text-xs">{log.ip}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="capitalize font-medium">{log.deviceType}</span>
                      <span className="text-muted-foreground text-[10px]">{log.browser}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{log.city}, {log.countryCode}</span>
                      <span className="text-muted-foreground text-[10px]">{log.country}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {log.isVpn ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
                        <Shield className="w-3 h-3" />
                        Yes
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{log.lastPage}</TableCell>
                  <TableCell className="font-mono font-bold text-xs">{log.visitCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(log.updatedAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} visitors
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOffset(Math.max(0, offset - limit));
              fetchLogs(search, Math.max(0, offset - limit));
            }}
            disabled={offset === 0 || loading}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOffset(offset + limit);
              fetchLogs(search, offset + limit);
            }}
            disabled={offset + limit >= total || loading}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
