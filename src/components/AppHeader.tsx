
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Menu, Settings, HelpCircle } from 'lucide-react'; // Added HelpCircle
import { JiraLogo } from '@/components/icons/JiraLogo';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <JiraLogo className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold tracking-tight text-foreground">
            JiraCaseGen
          </span>
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" asChild>
            <Link href="/setup">
              <Settings className="mr-2 h-4 w-4" />
              Setup
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild  className="text-muted-foreground hover:text-foreground">
             <Link href="/setup" aria-label="Help and Setup">
                <HelpCircle className="h-5 w-5" />
             </Link>
          </Button>
        </div>

        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <nav className="grid gap-4 py-6">
                <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
                  <JiraLogo className="h-6 w-6 text-primary" />
                  <span>JiraCaseGen</span>
                </Link>
                <Link
                  href="/setup"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground"
                >
                  <Settings className="h-5 w-5" />
                  Setup
                </Link>
                 <Link
                  href="/setup" // Or a dedicated help page later
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground"
                >
                  <HelpCircle className="h-5 w-5" />
                  Help
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
