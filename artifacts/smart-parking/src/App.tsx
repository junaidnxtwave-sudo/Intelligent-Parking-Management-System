import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { useGetParkingLots, useGetParkingLot, useUpdateParkingOccupancy, useGetParkingReservations, useCreateParkingReservation, useCancelParkingReservation, useGetParkingDashboard, useGetParkingActivity, useGetParkingSession, getGetParkingLotsQueryKey, getGetParkingLotQueryKey, getGetParkingReservationsQueryKey, getGetParkingDashboardQueryKey, getGetParkingActivityQueryKey, getGetParkingSessionQueryKey } from '@workspace/api-client-react';
import type { ParkingLot, ParkingReservation, ParkingSession } from '@workspace/api-client-react';
import { Activity, ArrowDownUp, ArrowRight, CarFront, Check, ChevronDown, Gauge, MapPin, Search, ShieldCheck, SlidersHorizontal, TrendingUp, Wifi, X, Navigation, CalendarDays, CircleAlert, RefreshCw, Radio, WalletCards, SquareParking, CircleDot } from 'lucide-react';
import {
  Link,
  Route,
  Redirect,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const portalPath = `${basePath}/portal` || '/portal';

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the environment.');
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#23885f',
    colorForeground: '#192a33',
    colorMutedForeground: '#68777d',
    colorDanger: '#bd5656',
    colorBackground: '#ffffff',
    colorInput: '#f7f6f1',
    colorInputForeground: '#192a33',
    colorNeutral: '#d9ddd5',
    fontFamily: 'Manrope, sans-serif',
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#192a33] font-extrabold',
    headerSubtitle: 'text-[#68777d]',
    socialButtonsBlockButtonText: 'text-[#192a33] font-semibold',
    formFieldLabel: 'text-[#192a33] font-semibold',
    footerActionLink: 'text-[#23885f] font-bold',
    footerActionText: 'text-[#68777d]',
    dividerText: 'text-[#68777d]',
    identityPreviewEditButton: 'text-[#23885f]',
    formFieldSuccessText: 'text-[#23885f]',
    alertText: 'text-[#192a33]',
    logoBox: 'rounded-xl overflow-hidden',
    logoImage: 'rounded-lg',
    socialButtonsBlockButton: 'border-[#d9ddd5] bg-white rounded-xl',
    formButtonPrimary: 'bg-[#23885f] text-white rounded-xl',
    formFieldInput: 'bg-[#f7f6f1] text-[#192a33] border-[#d9ddd5] rounded-lg',
    footerAction: 'text-[#68777d]',
    dividerLine: 'bg-[#d9ddd5]',
    alert: 'bg-[#f7f6f1] text-[#192a33] rounded-xl',
    otpCodeFieldInput: 'border-[#d9ddd5] text-[#192a33]',
    formFieldRow: 'space-y-1',
    main: 'gap-5',
  },
};

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { isLoaded, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const session = useGetParkingSession({
    query: {
      queryKey: getGetParkingSessionQueryKey(),
      enabled: isLoaded && !!isSignedIn,
      staleTime: 60_000,
    },
  });
  const links = [
    { href: isSignedIn ? '/portal' : '/', label: 'Find parking', icon: Search },
    { href: '/reservations', label: 'Reservations', icon: CalendarDays },
    ...(session.data?.role === 'operator' ? [{ href: '/operations', label: 'Operations', icon: Gauge }] : []),
  ];
  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-inner max-w-[1440px] mx-auto px-[42px] min-h-[76px] flex items-center justify-between gap-5">
        <Link href="/" className="flex items-center gap-3 text-white no-underline" data-testid="link-home">
          <span className="brand-mark w-10 h-10 rounded-xl grid place-items-center"><SquareParking size={23}/></span>
          <span><span className="block font-extrabold tracking-tight text-[17px]">PARKLINE</span><span className="block text-[9px] tracking-[.2em] text-white/50 font-mono">CITY MOBILITY NETWORK</span></span>
        </Link>
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          {links.map(({href,label,icon:Icon}) => <Link key={href} href={href} className={`tab-link nav-link ${location===href?'active':''}`} data-testid={`link-${label.toLowerCase().replaceAll(' ','-')}`}><Icon size={16}/><span className="nav-label">{label}</span></Link>)}
        </nav>
        <div className="flex items-center gap-3">
          {isLoaded && isSignedIn ? <div className="flex items-center gap-3">
            <span className="hidden lg:block text-[11px] text-white/75 max-w-40 truncate">{session.data?.displayName ?? 'Signed in'}</span>
            <button type="button" onClick={() => void signOut({ redirectUrl: basePath || '/' })} className="text-[11px] text-white/75 hover:text-white" data-testid="button-sign-out">Sign out</button>
          </div> : isLoaded && <div className="flex items-center gap-2">
            <Link href="/sign-in" className="text-[11px] text-white/75 hover:text-white no-underline" data-testid="link-sign-in">Sign in</Link>
            <Link href="/sign-up" className="btn-primary !min-h-8 !px-3 !py-1.5 !text-[11px]" data-testid="link-sign-up">Create account</Link>
          </div>}
          <div className="hidden md:flex items-center gap-2 text-[11px] text-white/70"><span className="live-dot"/><span className="font-mono tracking-wide">NETWORK LIVE</span></div>
        </div>
      </div>
    </header>
    <main>{children}</main>
  </div>;
}

function LoadState() { return <div className="page-wrap"><div className="skeleton h-8 w-56 rounded-lg mb-3"/><div className="skeleton h-4 w-80 rounded mb-8"/><div className="grid md:grid-cols-3 gap-4"><div className="skeleton h-52 rounded-2xl"/><div className="skeleton h-52 rounded-2xl"/><div className="skeleton h-52 rounded-2xl"/></div></div>; }
function ErrorState({ retry, title = 'We could not reach the network' }: {retry:()=>void;title?:string}) { return <div className="panel p-8 text-center max-w-xl mx-auto"><CircleAlert className="mx-auto text-[hsl(var(--destructive))] mb-3" size={28}/><h3 className="font-extrabold text-lg">{title}</h3><p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">Check your connection and try again. Live network data will appear as soon as it is available.</p><button onClick={retry} className="btn-quiet mt-5 inline-flex gap-2 items-center" data-testid="button-retry"><RefreshCw size={15}/> Try again</button></div>; }

function Home() {
  const [search, setSearch] = useState('');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<'recommended'|'price'|'availability'>('recommended');
  const [selected, setSelected] = useState<ParkingLot | null>(null);
  const [location, setLocation] = useLocation();
  const { isSignedIn } = useUser();
  const account = useGetParkingSession({
    query: { queryKey: getGetParkingSessionQueryKey(), enabled: !!isSignedIn },
  });
  const params = { ...(search.trim()?{q:search.trim()}:{}), ...(availableOnly?{availableOnly:true}:{}), sort };
  const lotsQuery = useGetParkingLots(params, {query:{queryKey:getGetParkingLotsQueryKey(params),refetchInterval:10000}});
  const lots = lotsQuery.data;
  const {data:details} = useGetParkingLot(selected?.id ?? 0, {query:{enabled:!!selected, queryKey:getGetParkingLotQueryKey(selected?.id ?? 0),refetchInterval:10000}});
  const createReservation = useCreateParkingReservation();
  const client = useQueryClient();
  const [confirmation, setConfirmation] = useState<ParkingReservation|null>(null);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({vehiclePlate:'',startsAt:'',durationHours:2});
  const submitReservation = (event:FormEvent) => {
    event.preventDefault(); if(!selected) return; setFormError('');
    const payload = {...form, lotId:selected.id, startsAt:new Date(form.startsAt).toISOString(), durationHours:Number(form.durationHours)};
    createReservation.mutate({data:payload}, {onSuccess:(reservation)=>{
      setConfirmation(reservation); setSelected(null);
      void client.invalidateQueries({queryKey:getGetParkingLotsQueryKey()});
      void client.invalidateQueries({queryKey:getGetParkingReservationsQueryKey()});
      void client.invalidateQueries({queryKey:getGetParkingDashboardQueryKey()});
      void client.invalidateQueries({queryKey:getGetParkingActivityQueryKey()});
    },onError:()=>setFormError('That space may have just been taken. Refresh availability and try again.')});
  };
  const openReserve = (lot:ParkingLot) => {
    if (!isSignedIn) {
      window.sessionStorage.setItem('parkline-reserve-lot', String(lot.id));
      setLocation('/sign-in');
      return;
    }
    setSelected(lot);
    setForm({vehiclePlate:'',startsAt:new Date(Date.now()+15*60000).toISOString().slice(0,16),durationHours:2});
    setFormError('');
  };
  useEffect(() => {
    if (!isSignedIn || !lots?.length) return;
    const queuedLot = window.sessionStorage.getItem('parkline-reserve-lot');
    if (!queuedLot) return;
    const lot = lots.find((item) => item.id === Number(queuedLot));
    window.sessionStorage.removeItem('parkline-reserve-lot');
    if (lot) openReserve(lot);
  }, [isSignedIn, lots]);
  return <div className="page-wrap">
    <section className="mb-8 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
      <div className="fade-in"><p className="eyebrow mb-3">PARKING, WITHOUT THE GUESSWORK</p><h1 className="text-[34px] md:text-[43px] font-extrabold tracking-[-.055em] leading-[1.08]">A good spot changes<br className="hidden sm:block"/> the whole trip.</h1><p className="text-[hsl(var(--muted-foreground))] mt-3 max-w-lg text-[14px] leading-6">Live availability across the city. Find a space, know the price, and get on with your day.</p></div>
      <div className="panel px-5 py-4 flex items-center gap-4 w-full lg:w-auto"><div className="brand-mark rounded-xl w-10 h-10 grid place-items-center"><Navigation size={19}/></div><div className="flex-1"><div className="eyebrow">YOUR CITY NETWORK</div><div className="font-bold text-sm mt-1">Live spaces, updated in real time</div></div><div className="live-dot"/></div>
    </section>
    <section className="panel p-3 md:p-4 mb-6">
      <div className="grid md:grid-cols-[1fr_auto_auto] gap-3 items-center">
        <label className="relative"><Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"/><input value={search} onChange={e=>setSearch(e.target.value)} className="field pl-10" placeholder="Search a neighborhood, street, or landmark" data-testid="input-search-lots"/></label>
        <button onClick={()=>setAvailableOnly(v=>!v)} className={`btn-quiet flex items-center justify-center gap-2 ${availableOnly?'!border-[hsl(var(--primary))] !text-[hsl(var(--primary))]':''}`} aria-pressed={availableOnly} data-testid="toggle-available"><SlidersHorizontal size={15}/>{availableOnly?'Available now':'All spaces'}</button>
        <label className="relative"><ArrowDownUp size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] pointer-events-none"/><select value={sort} onChange={e=>setSort(e.target.value as typeof sort)} className="field pl-9 pr-8 appearance-none min-w-[170px]" data-testid="select-sort"><option value="recommended">Recommended</option><option value="price">Lowest price</option><option value="availability">Most spaces</option></select><ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"/></label>
      </div>
      <div className="flex items-center justify-between px-1 pt-3 text-xs text-[hsl(var(--muted-foreground))]"><span>{lots?.length ?? '—'} locations in the network</span><span className="flex items-center gap-2"><Wifi size={13}/> Sensor data · live</span></div>
    </section>
    {lotsQuery.isLoading ? <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i=><div key={i} className="skeleton h-60 rounded-2xl"/>)}</div> :
      lotsQuery.isError ? <ErrorState retry={()=>void lotsQuery.refetch()} title="Parking availability is unavailable"/> :
      !lots?.length ? <div className="panel py-16 px-6 text-center"><MapPin size={28} className="mx-auto text-[hsl(var(--muted-foreground))]"/><h3 className="font-extrabold mt-4">No matching parking yet</h3><p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">Try another area or clear your availability filter.</p><button className="btn-quiet mt-5" onClick={()=>{setSearch('');setAvailableOnly(false)}} data-testid="button-clear-filters">Clear filters</button></div> :
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{lots.map((lot,index)=><LotCard key={lot.id} lot={lot} index={index} onReserve={()=>openReserve(lot)}/>)}</div>}
    {selected && <div className="fixed inset-0 z-50 bg-[hsl(205_32%_13%/.58)] backdrop-blur-sm grid place-items-center p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><div className="panel w-full max-w-[560px] max-h-[94dvh] overflow-auto p-6 md:p-8 fade-in">
      <div className="flex justify-between gap-4"><div><p className="eyebrow">RESERVE A SPACE</p><h2 className="text-2xl font-extrabold mt-1">{details?.name ?? selected.name}</h2><p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{details?.address ?? selected.address}</p></div><button className="btn-quiet p-2 h-fit" onClick={()=>setSelected(null)} aria-label="Close" data-testid="button-close-reservation"><X size={17}/></button></div>
      <div className="my-5 rounded-xl bg-[hsl(var(--muted))] p-4 flex justify-between items-center"><div><span className="eyebrow">HOURLY RATE</span><div className="font-extrabold text-xl mt-1">{money((details??selected).hourlyRate)}<small className="text-xs font-medium text-[hsl(var(--muted-foreground))]"> / hour</small></div></div><div className="text-right"><span className="eyebrow">AVAILABLE</span><div className="font-extrabold text-xl mt-1">{(details??selected).availableSpaces} <small className="text-xs font-medium">spaces</small></div></div></div>
      <form onSubmit={submitReservation} className="space-y-4">
        <div className="rounded-lg bg-[hsl(var(--muted))] px-3.5 py-3 text-xs"><span className="eyebrow">RESERVING AS</span><p className="font-bold mt-1">{account.data?.displayName ?? 'Your Parkline account'} <span className="font-normal text-[hsl(var(--muted-foreground))]">· {account.data?.email ?? 'Verified account'}</span></p></div>
        <div className="grid sm:grid-cols-2 gap-3"><label className="text-xs font-bold">Vehicle plate<input required value={form.vehiclePlate} onChange={e=>setForm({...form,vehiclePlate:e.target.value.toUpperCase()})} className="field mt-1.5 uppercase" placeholder="ABC 1234" data-testid="input-vehicle-plate"/></label><label className="text-xs font-bold">Arrival time<input required type="datetime-local" value={form.startsAt} onChange={e=>setForm({...form,startsAt:e.target.value})} className="field mt-1.5" data-testid="input-start-time"/></label></div>
        <label className="text-xs font-bold block">How long do you need it?<select value={form.durationHours} onChange={e=>setForm({...form,durationHours:Number(e.target.value)})} className="field mt-1.5" data-testid="select-duration">{Array.from({length:24},(_,i)=><option key={i+1} value={i+1}>{i+1} hour{i?'s':''}</option>)}</select></label>
        {formError&&<p className="text-sm text-[hsl(var(--destructive))]" role="alert" data-testid="status-reservation-error">{formError}</p>}
        <button disabled={createReservation.isPending||selected.availableSpaces<1} className="btn-primary w-full flex justify-center items-center gap-2 disabled:opacity-50" data-testid="button-confirm-reservation">{createReservation.isPending?'Confirming…':<>Reserve for {money((details??selected).hourlyRate*form.durationHours)} <ArrowRight size={16}/></>}</button>
        <p className="text-center text-[11px] text-[hsl(var(--muted-foreground))] flex justify-center items-center gap-1"><ShieldCheck size={13}/> Your reservation is confirmed instantly</p>
      </form>
    </div></div>}
    {confirmation&&<div className="fixed bottom-5 right-5 z-[60] panel p-5 w-[min(420px,calc(100vw-40px))] border-l-4 !border-l-[hsl(var(--primary))] shadow-xl fade-in" role="status" data-testid="status-reservation-confirmed"><button className="absolute right-3 top-3 text-[hsl(var(--muted-foreground))]" onClick={()=>setConfirmation(null)} aria-label="Dismiss" data-testid="button-dismiss-confirmation"><X size={16}/></button><div className="flex gap-3"><span className="w-9 h-9 rounded-full bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))] grid place-items-center shrink-0"><Check size={18}/></span><div><div className="font-extrabold">You’re all set</div><p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">Space reserved at {confirmation.lotName}.</p><p className="mono text-xs mt-2">CONFIRMATION · {confirmation.confirmationCode}</p><Link href="/reservations" className="text-xs text-[hsl(var(--primary))] font-bold inline-flex gap-1 items-center mt-3" data-testid="link-view-reservations">View your reservations <ArrowRight size={13}/></Link></div></div></div>}
  </div>;
}

function LotCard({lot,index,onReserve}:{lot:ParkingLot;index:number;onReserve:()=>void}) {
  const percent=Math.round(lot.occupiedSpaces/Math.max(1,lot.totalSpaces)*100);
  const tight=lot.availableSpaces<=5;
  return <article className="panel p-5 flex flex-col fade-in hover:-translate-y-0.5" style={{animationDelay:`${Math.min(index,8)*35}ms`}} data-testid={`card-parking-lot-${lot.id}`}>
    <div className="flex justify-between gap-3"><div><div className="flex gap-2 items-center"><span className={`w-2 h-2 rounded-full ${lot.isOpen?'bg-[hsl(var(--primary))]':'bg-[hsl(var(--destructive))]'}`}/><span className="eyebrow">{lot.isOpen?'OPEN NOW':'CLOSED'}</span></div><h2 className="font-extrabold text-[17px] tracking-tight mt-2">{lot.name}</h2><p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{lot.address}</p></div><span className="text-right"><b className="mono text-xl">{money(lot.hourlyRate)}</b><small className="block text-[10px] text-[hsl(var(--muted-foreground))]">per hour</small></span></div>
    <div className="flex items-center gap-2 mt-4 text-xs text-[hsl(var(--muted-foreground))]"><MapPin size={14}/>{lot.area}<span className="text-[hsl(var(--border))]">/</span>{lot.distanceKm.toFixed(1)} km away</div>
    <div className="mt-5 bg-[hsl(var(--muted))] rounded-xl p-3.5"><div className="flex justify-between items-baseline mb-2"><span className="eyebrow">LIVE CAPACITY</span><span className={`mono text-[13px] font-bold ${tight?'text-[hsl(var(--accent))]':'text-[hsl(var(--primary))]'}`} data-testid={`text-available-spaces-${lot.id}`}>{lot.availableSpaces} <span className="text-[hsl(var(--muted-foreground))] font-normal">of {lot.totalSpaces} free</span></span></div><div className="bar-track"><div className="bar-fill" style={{width:`${percent}%`,background:tight?'hsl(var(--accent))':undefined}}/></div></div>
    <div className="flex gap-1.5 flex-wrap mt-4 min-h-6">{lot.amenities.slice(0,3).map(item=><span key={item} className="px-2 py-1 rounded-md bg-[hsl(var(--background))] text-[10px] font-semibold text-[hsl(var(--muted-foreground))]">{item}</span>)}</div>
    <button disabled={!lot.isOpen||lot.availableSpaces<1} onClick={onReserve} className="btn-primary w-full mt-4 flex items-center justify-center gap-2 disabled:opacity-40" data-testid={`button-reserve-${lot.id}`}>Reserve a space <ArrowRight size={15}/></button>
  </article>;
}

function Reservations() {
  const [status,setStatus]=useState('');
  const params={...(status?{status:status as 'reserved'|'active'|'completed'|'cancelled'}:{})};
  const query=useGetParkingReservations(params,{query:{queryKey:getGetParkingReservationsQueryKey(params),refetchInterval:10000}});
  const cancel=useCancelParkingReservation();
  const client=useQueryClient();
  const [error,setError]=useState('');
  const rows=query.data;
  const doCancel=(id:number)=>{if(!window.confirm('Cancel this parking reservation?'))return;setError('');cancel.mutate({id},{onSuccess:()=>{void client.invalidateQueries({queryKey:getGetParkingReservationsQueryKey()});void client.invalidateQueries({queryKey:getGetParkingLotsQueryKey()});void client.invalidateQueries({queryKey:getGetParkingDashboardQueryKey()});void client.invalidateQueries({queryKey:getGetParkingActivityQueryKey()})},onError:()=>setError('We could not cancel this reservation. Please try again.')})};
  return <div className="page-wrap"><div className="mb-7"><p className="eyebrow mb-3">YOUR PARKLINE ACCOUNT</p><h1 className="text-3xl md:text-[38px] font-extrabold tracking-[-.05em]">Reservations</h1><p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">Keep track of upcoming stops and past parking.</p></div>
    <div className="panel p-3 mb-5 flex justify-end"><label className="sr-only" htmlFor="reservation-status-filter">Filter reservations by status</label><select id="reservation-status-filter" value={status} onChange={e=>setStatus(e.target.value)} className="field max-w-[220px]" data-testid="select-reservation-status"><option value="">All statuses</option><option value="reserved">Reserved</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></div>
    {error&&<div className="mb-4 text-sm text-[hsl(var(--destructive))]" role="alert">{error}</div>}
    {query.isLoading?<div className="space-y-3">{[1,2,3].map(i=><div key={i} className="skeleton h-36 rounded-2xl"/>)}</div>:query.isError?<ErrorState retry={()=>void query.refetch()} title="Reservations did not load"/>:!rows?.length?<div className="panel text-center py-16 px-6"><CalendarDays className="mx-auto text-[hsl(var(--muted-foreground))]" size={28}/><h2 className="font-extrabold mt-4">No reservations found</h2><p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">{status?'Try changing your filter.':'When you book parking, your trips will show up here.'}</p><Link href="/portal" className="btn-primary inline-flex items-center gap-2 mt-5" data-testid="link-find-parking">Find parking <ArrowRight size={15}/></Link></div>:
      <div className="space-y-3">{rows.map(r=><ReservationRow key={r.id} reservation={r} cancelling={cancel.isPending} onCancel={()=>doCancel(r.id)}/>)}</div>}
  </div>;
}
function ReservationRow({reservation:r,cancelling,onCancel}:{reservation:ParkingReservation;cancelling:boolean;onCancel:()=>void}) {
  return <article className="panel p-5 md:p-6 grid md:grid-cols-[1fr_auto] gap-5 items-center" data-testid={`row-reservation-${r.id}`}><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-extrabold text-lg">{r.lotName}</h2><span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${r.status==='cancelled'?'bg-[hsl(var(--destructive)/.11)] text-[hsl(var(--destructive))]':r.status==='active'?'bg-[hsl(var(--primary)/.12)] text-[hsl(var(--primary))]':'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`} data-testid={`status-reservation-${r.id}`}>{r.status}</span></div><div className="grid sm:grid-cols-3 gap-y-3 gap-x-8 mt-4"><div><span className="eyebrow">ARRIVAL</span><p className="text-sm font-semibold mt-1">{dateTime(r.startsAt)}</p></div><div><span className="eyebrow">DURATION</span><p className="text-sm font-semibold mt-1">{r.durationHours} hours · {r.vehiclePlate}</p></div><div><span className="eyebrow">CONFIRMATION</span><p className="mono text-sm mt-1">{r.confirmationCode}</p></div></div></div><div className="flex md:flex-col justify-between md:items-end items-center gap-3 border-t md:border-t-0 pt-4 md:pt-0"><strong className="mono text-xl">{money(r.totalPrice)}</strong>{(r.status==='reserved'||r.status==='active')&&<button onClick={onCancel} disabled={cancelling} className="btn-quiet !text-[hsl(var(--destructive))] !border-[hsl(var(--destructive)/.3)] text-xs disabled:opacity-50" data-testid={`button-cancel-reservation-${r.id}`}>{cancelling?'Cancelling…':'Cancel reservation'}</button>}</div></article>;
}

function Operations() {
  const dashboard=useGetParkingDashboard({query:{queryKey:getGetParkingDashboardQueryKey(),refetchInterval:10000}});
  const activities=useGetParkingActivity({query:{queryKey:getGetParkingActivityQueryKey(),refetchInterval:10000}});
  const lotsQuery=useGetParkingLots(undefined,{query:{queryKey:getGetParkingLotsQueryKey(),refetchInterval:10000}});
  const occupancy=useUpdateParkingOccupancy();
  const client=useQueryClient();
  const [notice,setNotice]=useState('');
  const [busyId,setBusyId]=useState<number|null>(null);
  const update=(lot:ParkingLot,delta:number)=>{const spaces=Math.max(0,Math.min(lot.totalSpaces,lot.occupiedSpaces+delta));setBusyId(lot.id);setNotice('');occupancy.mutate({id:lot.id,data:{occupiedSpaces:spaces}},{onSuccess:()=>{setNotice(`${lot.name} occupancy updated.`);void client.invalidateQueries({queryKey:getGetParkingLotsQueryKey()});void client.invalidateQueries({queryKey:getGetParkingLotQueryKey(lot.id)});void client.invalidateQueries({queryKey:getGetParkingDashboardQueryKey()});void client.invalidateQueries({queryKey:getGetParkingActivityQueryKey()})},onError:()=>setNotice('Occupancy update failed. Please retry.'),onSettled:()=>setBusyId(null)})};
  if(dashboard.isLoading)return <LoadState/>;
  if(dashboard.isError||!dashboard.data)return <div className="page-wrap"><ErrorState retry={()=>void dashboard.refetch()} title="Operations data is unavailable"/></div>;
  const d=dashboard.data;
  return <div className="page-wrap"><div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-7"><div><p className="eyebrow mb-3">PARKLINE · NETWORK CONTROL</p><h1 className="text-3xl md:text-[38px] font-extrabold tracking-[-.05em]">Operations overview</h1><p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">A live pulse on parking across your city.</p></div><div className="flex items-center gap-2 text-xs rounded-full px-3 py-2 bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))] font-bold"><span className="live-dot"/>LIVE NETWORK</div></div>
    <section className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
      <Metric icon={SquareParking} label="Connected lots" value={d.totalLots.toLocaleString()} detail={`${d.totalSpaces.toLocaleString()} total spaces`}/>
      <Metric icon={CircleDot} label="Network occupancy" value={`${d.occupancyRate.toFixed(1)}%`} detail={`${d.occupiedSpaces.toLocaleString()} occupied`} accent/>
      <Metric icon={CalendarDays} label="Active reservations" value={d.activeReservations.toLocaleString()} detail={`${d.availableSpaces.toLocaleString()} spaces available`}/>
      <Metric icon={WalletCards} label="Revenue today" value={money(d.revenueToday)} detail={`${d.revenueChangePercent>=0?'+':''}${d.revenueChangePercent.toFixed(1)}% vs yesterday`} accent={d.revenueChangePercent>=0}/>
    </section>
    <section className="grid xl:grid-cols-[1.45fr_1fr] gap-4 mb-5">
      <div className="panel p-5 md:p-6"><div className="flex justify-between items-start"><div><p className="eyebrow">OCCUPANCY TREND</p><h2 className="font-extrabold text-lg mt-1">Spaces in use</h2></div><span className="w-9 h-9 rounded-xl bg-[hsl(var(--primary)/.1)] grid place-items-center text-[hsl(var(--primary))]"><TrendingUp size={17}/></span></div>
        {d.occupancyTrend.length?<div className="mt-6 flex items-end gap-2 h-40 border-b border-[hsl(var(--border))] pb-2">{d.occupancyTrend.map((item,i)=><div className="flex-1 h-full flex flex-col justify-end items-center gap-2" key={`${item.label}-${i}`}><span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">{item.occupancyRate.toFixed(0)}%</span><div className="w-full max-w-[34px] rounded-t-md bg-[hsl(var(--primary))] opacity-80" style={{height:`${Math.max(3,Math.min(100,item.occupancyRate))}%`}}/><span className="text-[9px] text-[hsl(var(--muted-foreground))] whitespace-nowrap">{item.label}</span></div>)}</div>:<EmptyTrend label="Occupancy trend is not available yet"/>}
      </div>
      <div className="panel p-5 md:p-6"><div className="flex justify-between items-start"><div><p className="eyebrow">REVENUE TREND</p><h2 className="font-extrabold text-lg mt-1">Daily takings</h2></div><span className="w-9 h-9 rounded-xl bg-[hsl(var(--accent)/.18)] grid place-items-center"><WalletCards size={17}/></span></div>
        {d.revenueTrend.length?<div className="mt-6 flex items-end gap-2 h-40 border-b border-[hsl(var(--border))] pb-2">{d.revenueTrend.map((item,i)=>{const max=Math.max(...d.revenueTrend.map(x=>x.revenue),1);return <div className="flex-1 h-full flex flex-col justify-end items-center gap-2" key={`${item.label}-${i}`}><span className="mono text-[9px] text-[hsl(var(--muted-foreground))]">{money(item.revenue)}</span><div className="w-full max-w-[34px] rounded-t-md bg-[hsl(var(--accent))] opacity-90" style={{height:`${Math.max(3,item.revenue/max*100)}%`}}/><span className="text-[9px] text-[hsl(var(--muted-foreground))] whitespace-nowrap">{item.label}</span></div>})}</div>:<EmptyTrend label="Revenue trend is not available yet"/>}
      </div>
    </section>
    <section className="grid xl:grid-cols-[1.4fr_1fr] gap-4">
      <div className="panel overflow-hidden"><div className="p-5 flex justify-between items-center border-b border-[hsl(var(--border))]"><div><p className="eyebrow">SENSOR NETWORK</p><h2 className="font-extrabold mt-1">Lot occupancy</h2></div><span className="text-xs text-[hsl(var(--muted-foreground))]">{lotsQuery.data?.length??0} locations</span></div>
        {lotsQuery.isLoading?<div className="p-5 space-y-3">{[1,2,3].map(i=><div className="skeleton h-16 rounded-lg" key={i}/>)}</div>:lotsQuery.isError?<div className="p-5"><ErrorState retry={()=>void lotsQuery.refetch()} title="Lot data unavailable"/></div>:!lotsQuery.data?.length?<div className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">No connected lots to display.</div>:<div className="divide-y divide-[hsl(var(--border))]">{lotsQuery.data.map(lot=><div className="px-5 py-4 flex items-center gap-4" key={lot.id} data-testid={`row-occupancy-${lot.id}`}><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="font-bold text-sm truncate">{lot.name}</p><span className="mono text-xs" data-testid={`text-occupancy-${lot.id}`}>{lot.occupiedSpaces}/{lot.totalSpaces}</span></div><div className="bar-track mt-2"><div className="bar-fill" style={{width:`${Math.round(lot.occupiedSpaces/Math.max(1,lot.totalSpaces)*100)}%`}}/></div><p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">{lot.availableSpaces} available · updated {dateTime(lot.updatedAt)}</p></div><div className="flex gap-1"><button className="btn-quiet !p-2" aria-label={`Decrease occupancy ${lot.name}`} disabled={busyId===lot.id||lot.occupiedSpaces===0} onClick={()=>update(lot,-1)} data-testid={`button-occupancy-down-${lot.id}`}>−</button><button className="btn-quiet !p-2" aria-label={`Increase occupancy ${lot.name}`} disabled={busyId===lot.id||lot.occupiedSpaces===lot.totalSpaces} onClick={()=>update(lot,1)} data-testid={`button-occupancy-up-${lot.id}`}>+</button></div></div>)}</div>}
        {notice&&<div className={`px-5 py-3 text-xs ${notice.includes('failed')?'text-[hsl(var(--destructive))]':'text-[hsl(var(--primary))]'}`} role="status" data-testid="status-occupancy-update">{notice}</div>}
      </div>
      <div className="panel overflow-hidden"><div className="p-5 flex items-center justify-between border-b border-[hsl(var(--border))]"><div><p className="eyebrow">NETWORK SIGNAL</p><h2 className="font-extrabold mt-1">Recent activity</h2></div><Activity size={17} className="text-[hsl(var(--muted-foreground))]"/></div>
        {activities.isLoading?<div className="p-5 space-y-4">{[1,2,3].map(i=><div key={i} className="skeleton h-12 rounded-lg"/>)}</div>:activities.isError?<div className="p-5"><ErrorState retry={()=>void activities.refetch()} title="Activity feed unavailable"/></div>:!activities.data?.length?<div className="p-10 text-center"><Radio className="mx-auto text-[hsl(var(--muted-foreground))]" size={24}/><p className="text-sm text-[hsl(var(--muted-foreground))] mt-3">No activity recorded yet.</p></div>:<div className="divide-y divide-[hsl(var(--border))]">{activities.data.map(item=><div key={item.id} className="p-4 flex gap-3" data-testid={`activity-${item.id}`}><span className={`w-8 h-8 rounded-lg shrink-0 grid place-items-center ${item.type==='reservation_cancelled'?'bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]':'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]'}`}>{item.type==='occupancy_updated'?<Gauge size={15}/>:item.type==='reservation_cancelled'?<X size={15}/>:<CarFront size={15}/>}</span><div className="min-w-0"><p className="text-xs font-semibold leading-5">{item.message}</p><p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">{item.lotName} · {dateTime(item.createdAt)}</p></div></div>)}</div>}
      </div>
    </section>
  </div>;
}
function Metric({icon:Icon,label,value,detail,accent=false}:{icon:typeof Gauge;label:string;value:string;detail:string;accent?:boolean}) {return <div className="panel p-5" data-testid={`metric-${label.toLowerCase().replaceAll(' ','-')}`}><div className="flex justify-between items-start"><span className="eyebrow">{label}</span><span className={`w-8 h-8 rounded-lg grid place-items-center ${accent?'bg-[hsl(var(--primary)/.1)] text-[hsl(var(--primary))]':'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}><Icon size={16}/></span></div><p className="mono text-[27px] font-medium tracking-tight mt-4" data-testid={`value-${label.toLowerCase().replaceAll(' ','-')}`}>{value}</p><p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">{detail}</p></div>}
function EmptyTrend({label}:{label:string}) {return <div className="h-40 flex items-center justify-center text-xs text-[hsl(var(--muted-foreground))]">{label}</div>;}

function HomeRedirect() {
  const { isLoaded, isSignedIn } = useUser();
  if (isLoaded && isSignedIn) return <Redirect to="/portal" />;
  return <Shell><Home /></Shell>;
}

function PortalRoute() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <LoadState />;
  if (!isSignedIn) return <Redirect to="/" />;
  return <Shell><Home /></Shell>;
}

function ReservationsRoute() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return <LoadState />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  return <Shell><Reservations /></Shell>;
}

function OperationsRoute() {
  const { isLoaded, isSignedIn } = useUser();
  const session = useGetParkingSession({
    query: {
      queryKey: getGetParkingSessionQueryKey(),
      enabled: isLoaded && !!isSignedIn,
    },
  });
  if (!isLoaded) return <LoadState />;
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (session.isLoading) return <LoadState />;
  if (session.isError || !session.data) {
    return <div className="page-wrap"><ErrorState retry={() => void session.refetch()} title="Your account could not be checked"/></div>;
  }
  if (session.data.role !== 'operator') {
    return <Shell><div className="page-wrap"><div className="panel max-w-2xl mx-auto p-8 text-center"><ShieldCheck size={30} className="mx-auto text-[hsl(var(--primary))]"/><h1 className="font-extrabold text-xl mt-4">Operator access required</h1><p className="text-sm text-[hsl(var(--muted-foreground))] mt-2">This area is limited to approved parking operators. Your account remains available for parking reservations.</p><Link href="/portal" className="btn-primary inline-flex items-center gap-2 mt-5">Find parking <ArrowRight size={15}/></Link></div></div></Shell>;
  }
  return <Shell><Operations /></Shell>;
}

function SignInPage() {
  return <div className="min-h-[100dvh] grid place-items-center bg-[hsl(var(--background))] px-4 py-10">
    <div className="w-full max-w-[480px]">
      <div className="text-center mb-5"><p className="eyebrow">PARKLINE · CITY MOBILITY NETWORK</p><h1 className="text-2xl font-extrabold mt-2">Welcome back</h1><p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Sign in to manage reservations and parking operations.</p></div>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      <Link href="/" className="block text-center text-xs text-[hsl(var(--muted-foreground))] mt-5 hover:text-[hsl(var(--foreground))]">Back to public parking search</Link>
    </div>
  </div>;
}

function SignUpPage() {
  return <div className="min-h-[100dvh] grid place-items-center bg-[hsl(var(--background))] px-4 py-10">
    <div className="w-full max-w-[480px]">
      <div className="text-center mb-5"><p className="eyebrow">PARKLINE · CITY MOBILITY NETWORK</p><h1 className="text-2xl font-extrabold mt-2">Create your account</h1><p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Book parking with your verified account.</p></div>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
      <Link href="/" className="block text-center text-xs text-[hsl(var(--muted-foreground))] mt-5 hover:text-[hsl(var(--foreground))]">Back to public parking search</Link>
    </div>
  </div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) {
        client.clear();
      }
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);

  return null;
}

function ClerkProviderWithRouter() {
  const [, setLocation] = useLocation();

  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your Parkline account.' } },
      signUp: { start: { title: 'Create your account', subtitle: 'Book parking with your verified account.' } },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <ClerkQueryClientCacheInvalidator />
    <Router />
    <Toaster />
  </ClerkProvider>;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/portal" component={PortalRoute} />
        <Route path="/reservations" component={ReservationsRoute} />
        <Route path="/operations" component={OperationsRoute} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={basePath}>
          <ClerkProviderWithRouter />
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
