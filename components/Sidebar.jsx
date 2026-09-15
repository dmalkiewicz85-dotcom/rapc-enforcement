'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import clsx from 'clsx'
import {
  LayoutDashboard, FilePlus, ListChecks, Home, Gavel, Receipt, Settings, Menu, X,
} from 'lucide-react'
import { can } from '@/lib/schema'

const NAV = [
  { label: 'Dashboard',       icon: LayoutDashboard, href: '/',               exact: true },
  { label: 'New Violation',   icon: FilePlus,        href: '/violations/new', perm: 'submit' },
  { label: 'Violations',      icon: ListChecks,      href: '/violations' },
  { label: 'Properties',      icon: Home,            href: '/properties' },
  { label: 'Board Approvals', icon: Gavel,           href: '/approvals',      perm: 'approve_enforcement' },
  { label: 'Fines / PM',      icon: Receipt,         href: '/fines',          perm: 'pm_reports' },
  { label: 'Admin',           icon: Settings,        href: '/admin',          perm: 'manage_settings' },
]

export default function Sidebar({ user }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const items = NAV.filter(i => !i.perm || !user || can(user, i.perm))

  return (
    <aside className="bg-brand-900 text-white md:w-60 md:shrink-0 md:min-h-screen">
      <div className="flex items-center justify-between px-5 py-4 border-b border-brand-800">
        <div>
          <div className="text-lg font-semibold leading-tight">Reserves at Park Creek</div>
          <div className="text-xs text-brand-200 uppercase tracking-wider">Enforcement</div>
        </div>
        <button className="md:hidden" onClick={() => setOpen(o => !o)} aria-label="Toggle menu">
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      <nav className={clsx('px-3 py-3 space-y-1', open ? 'block' : 'hidden md:block')}>
        {items.map(({ label, icon: Icon, href, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={clsx(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm',
                active ? 'bg-brand-700 text-white' : 'text-brand-100 hover:bg-brand-800',
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
