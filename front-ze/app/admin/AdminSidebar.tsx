'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Sheet, SheetContent } from 'components/ui/sheet';
import { ScrollArea } from 'components/ui/scroll-area';
import { Button } from 'components/ui/button';
import { FileText, MessageSquare, Music, Ban, Shield, Megaphone, Bell, Settings, Box, Heart, Server, Menu, Link2, Award, History } from 'lucide-react';

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavSection = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: 'Content',
    icon: Megaphone,
    items: [
      { label: 'Announcements', href: '/admin/announcements', icon: Megaphone },
      { label: 'Map Management', href: '/admin/maps', icon: Box },
      { label: 'Character Models', href: '/admin/characters', icon: Box },
      { label: 'Donors', href: '/admin/donors', icon: Heart },
      { label: 'Special Thanks', href: '/admin/special-thanks', icon: Award },
      { label: 'Community Links', href: '/admin/community-links', icon: Link2 },
      { label: 'Server Nominations', href: '/admin/server-requests', icon: Server },
      { label: 'Servers', href: '/admin/servers', icon: Server },
    ],
  },
  {
    title: 'Reports',
    icon: Shield,
    items: [
      { label: 'Guide Reports', href: '/admin/reports/guides', icon: FileText },
      { label: 'Comment Reports', href: '/admin/reports/comments', icon: MessageSquare },
      { label: 'Music Reports', href: '/admin/reports/music', icon: Music },
    ],
  },
  {
    title: 'Moderation',
    icon: Ban,
    items: [
      { label: 'Banned Users', href: '/admin/bans', icon: Ban },
    ],
  },
  {
    title: 'System',
    icon: Settings,
    items: [
      { label: 'Push Notifications', href: '/admin/notifications', icon: Bell },
      { label: 'Audit Log', href: '/admin/audit-logs', icon: History },
    ],
  },
];

const MAP_MANAGER_ROUTES = ['/admin/maps', '/admin/audit-logs'];

function SidebarContent({ onNavigate, mapManagerOnly }: { onNavigate?: () => void; mapManagerOnly?: boolean }) {
  const pathname = usePathname();
  const sections = mapManagerOnly
    ? navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => MAP_MANAGER_ROUTES.includes(item.href)),
        }))
        .filter((section) => section.items.length > 0)
    : navSections;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-16 border-b border-border/40 bg-background/95 backdrop-blur flex-shrink-0">
        <h2 className="text-lg font-bold">Admin Dashboard</h2>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1">
        <div className="py-4">
          {sections.map((section) => (
            <div key={section.title} className="mb-6">
              {/* Section Header */}
              <div className="px-6 mb-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <section.icon className="h-4 w-4" />
                  {section.title}
                </div>
              </div>

              {/* Section Items */}
              <div className="space-y-1 px-3">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => onNavigate?.()}
                      className={`
                        flex items-center justify-between gap-3 px-3 py-2.5 rounded-md transition-all
                        ${isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'hover:bg-accent/60 text-foreground'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default function AdminSidebar({ mapManagerOnly }: { mapManagerOnly?: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="min-[769px]:hidden flex items-center gap-3 px-4 h-14 border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(true)}>
          <Menu className="h-5 w-5" />
        </Button>
        <h2 className="text-base font-bold">Admin Dashboard</h2>
      </div>

      {/* Mobile drawer */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left" className="w-[280px] p-0">
          <SidebarContent onNavigate={() => setIsOpen(false)} mapManagerOnly={mapManagerOnly} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside className="w-[280px] h-screen sticky top-0 left-0 border-r border-border/40 flex-shrink-0 max-[768px]:hidden">
        <SidebarContent mapManagerOnly={mapManagerOnly} />
      </aside>
    </>
  );
}
