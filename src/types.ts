export type TabType = 'events' | 'sports' | 'categories';

export type EventStatus = 'all' | 'live' | 'upcoming' | 'finished';

export type SportCategory = 'All' | 'Cricket' | 'WWE' | 'World Cup' | 'Football' | 'Tennis' | 'Basketball' | 'Motorsport';

export interface StreamServer {
  id: string;
  name: string;
  quality: string;
  url: string;
  type: 'hls' | 'mp4' | 'iframe';
  isHd?: boolean;
}

export interface MatchEvent {
  id: string;
  title: string;
  sport: SportCategory;
  category: string;
  subCategory?: string;
  status: 'live' | 'upcoming' | 'finished';
  isHot?: boolean;
  team1: {
    name: string;
    flag: string;
    score?: string;
    logoColor?: string;
  };
  team2: {
    name: string;
    flag: string;
    score?: string;
    logoColor?: string;
  };
  liveTime?: string;
  startTime?: string;
  date?: string;
  startsIn?: string;
  servers: StreamServer[];
  venue?: string;
  tournament: string;
  cricketData?: {
    overs?: string;
    currentBatsmen?: { name: string; runs: number; balls: number; fours: number; sixes: number; isStriker: boolean }[];
    currentBowler?: { name: string; overs: string; maidens: number; runs: number; wickets: number; econ: string };
    recentBalls?: string[];
    target?: string;
    crr?: string;
    rrr?: string;
  };
  footballData?: {
    minute?: string;
    stats?: {
      possession: [number, number];
      shotsOnTarget: [number, number];
      corners: [number, number];
      yellowCards: [number, number];
    };
    events?: { time: string; player: string; team: 1 | 2; type: 'goal' | 'card' | 'sub' }[];
  };
}

export interface SportsChannel {
  id: string;
  name: string;
  logo: string;
  bgGradient: string;
  accentColor: string;
  category: string;
  country: string;
  isPopular?: boolean;
  servers: StreamServer[];
  currentPlaying?: string;
}

export interface CategoryItem {
  id: string;
  name: string;
  icon: string;
  flag?: string;
  count: number;
  type: 'special' | 'country' | 'genre';
  color?: string;
}
