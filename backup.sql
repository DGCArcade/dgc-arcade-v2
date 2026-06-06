--
-- PostgreSQL database dump
--

\restrict dGPr9nVPU6eu488c2nUuHujMloKgF90NKK8f7uL6u5jiczq55zbfcrIdStU8sIL

-- Dumped from database version 16.10
-- Dumped by pg_dump version 16.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.bets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    game_id integer NOT NULL,
    amount numeric(18,8) NOT NULL,
    payout numeric(18,8) DEFAULT '0'::numeric NOT NULL,
    won boolean DEFAULT false NOT NULL,
    multiplier numeric(10,4),
    server_seed text,
    client_seed text,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.bets OWNER TO postgres;

--
-- Name: bets_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.bets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.bets_id_seq OWNER TO postgres;

--
-- Name: bets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.bets_id_seq OWNED BY public.bets.id;


--
-- Name: blackjack_hands; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.blackjack_hands (
    id integer NOT NULL,
    user_id integer NOT NULL,
    game_id integer NOT NULL,
    bet numeric(18,8) NOT NULL,
    server_seed text NOT NULL,
    deck_state text NOT NULL,
    player_hand text DEFAULT '[]'::text NOT NULL,
    dealer_hand text DEFAULT '[]'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.blackjack_hands OWNER TO postgres;

--
-- Name: blackjack_hands_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.blackjack_hands_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.blackjack_hands_id_seq OWNER TO postgres;

--
-- Name: blackjack_hands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.blackjack_hands_id_seq OWNED BY public.blackjack_hands.id;


--
-- Name: daily_bonus_claims; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.daily_bonus_claims (
    id integer NOT NULL,
    user_id integer NOT NULL,
    amount numeric(18,8) NOT NULL,
    claimed_date text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.daily_bonus_claims OWNER TO postgres;

--
-- Name: daily_bonus_claims_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.daily_bonus_claims_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.daily_bonus_claims_id_seq OWNER TO postgres;

--
-- Name: daily_bonus_claims_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.daily_bonus_claims_id_seq OWNED BY public.daily_bonus_claims.id;


--
-- Name: games; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.games (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    image_url text,
    min_bet numeric(18,8) DEFAULT 0.01 NOT NULL,
    max_bet numeric(18,8) DEFAULT '1000'::numeric NOT NULL,
    house_edge numeric(5,4) DEFAULT 0.03 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.games OWNER TO postgres;

--
-- Name: games_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.games_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.games_id_seq OWNER TO postgres;

--
-- Name: games_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.games_id_seq OWNED BY public.games.id;


--
-- Name: mines_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.mines_sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    game_id integer NOT NULL,
    bet numeric(18,8) NOT NULL,
    server_seed text NOT NULL,
    mine_count integer DEFAULT 5 NOT NULL,
    mine_positions text NOT NULL,
    revealed text DEFAULT '[]'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    current_multiplier numeric(10,4) DEFAULT '1'::numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.mines_sessions OWNER TO postgres;

--
-- Name: mines_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.mines_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.mines_sessions_id_seq OWNER TO postgres;

--
-- Name: mines_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.mines_sessions_id_seq OWNED BY public.mines_sessions.id;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.transactions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    type text NOT NULL,
    amount numeric(18,8) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    tx_hash text,
    address text,
    oxapay_track_id text,
    order_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.transactions OWNER TO postgres;

--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.transactions_id_seq OWNER TO postgres;

--
-- Name: transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.transactions_id_seq OWNED BY public.transactions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id integer NOT NULL,
    username text NOT NULL,
    password_hash text NOT NULL,
    balance numeric(18,8) DEFAULT '0'::numeric NOT NULL,
    avatar_url text,
    total_bets integer DEFAULT 0 NOT NULL,
    total_won numeric(18,8) DEFAULT '0'::numeric NOT NULL,
    role text DEFAULT 'player'::text NOT NULL,
    is_banned boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO postgres;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: bets id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bets ALTER COLUMN id SET DEFAULT nextval('public.bets_id_seq'::regclass);


--
-- Name: blackjack_hands id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blackjack_hands ALTER COLUMN id SET DEFAULT nextval('public.blackjack_hands_id_seq'::regclass);


--
-- Name: daily_bonus_claims id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_bonus_claims ALTER COLUMN id SET DEFAULT nextval('public.daily_bonus_claims_id_seq'::regclass);


--
-- Name: games id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.games ALTER COLUMN id SET DEFAULT nextval('public.games_id_seq'::regclass);


--
-- Name: mines_sessions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mines_sessions ALTER COLUMN id SET DEFAULT nextval('public.mines_sessions_id_seq'::regclass);


--
-- Name: transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions ALTER COLUMN id SET DEFAULT nextval('public.transactions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: bets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.bets (id, user_id, game_id, amount, payout, won, multiplier, server_seed, client_seed, meta, created_at) FROM stdin;
1	1	4	0.50000000	0.00000000	f	0.0000	fec9f231390f4bd790a7b1bbee3ece53	52109a08-263b-42ff-9aea-df4061b7a738	{"reels": ["💎", "💎", "🍋"]}	2026-06-04 02:22:40.850191+00
2	1	4	0.50000000	0.00000000	f	0.0000	a4d5c2208a2142ac8576393383e4bd3a	5f3f8d6b-db4b-46bc-a4c2-a039bd38eb29	{"reels": ["🔔", "💎", "🍒"]}	2026-06-04 02:22:48.653553+00
3	1	3	1.00000000	0.00000000	f	0.0000	cd3a0cd5bcab4134b5c15f1cb1847c88	6ad1e59c-ce83-45c4-a9d7-446bed872509	{"userMeta": {"cashoutAt": 2}, "crashPoint": 1.4507268755052407}	2026-06-04 02:23:14.282105+00
4	1	3	1.00000000	0.00000000	f	0.0000	5ebf7c08c433420183bab154baeba9b4	32fec1de-0d7e-4bd4-99ae-01aafa404b0a	{"userMeta": {"cashoutAt": 2}, "crashPoint": 1.3553984459099597}	2026-06-04 02:23:15.84428+00
5	1	3	1.00000000	2.00000000	t	2.0000	8668d9ff2188476ab93089df889f8d8e	298890a5-ecfd-4992-8a83-962083ea082b	{"userMeta": {"cashoutAt": 2}, "crashPoint": 4.178525904997038}	2026-06-04 02:23:26.931553+00
6	1	3	1.00000000	0.00000000	f	0.0000	f7f7c8e5d1d54601a343c42db7502d42	8b1bd5ad-1973-482f-86b5-db3650eb3495	{"userMeta": {"cashoutAt": 2}, "crashPoint": 1.0722164980489914}	2026-06-04 02:23:34.050045+00
7	1	7	1.00000000	0.00000000	f	0.0000	1f38ded13c6b4359b6f7e6051249ca67	blackjack	{"action": "stand", "result": "dealer_wins", "dealerHand": [{"rank": "K", "suit": "♥"}, {"rank": "9", "suit": "♦"}], "playerHand": [{"rank": "4", "suit": "♦"}, {"rank": "J", "suit": "♥"}]}	2026-06-04 02:33:10.329841+00
8	1	5	1.00000000	1.94600000	t	1.9460	71f2e6f73600481294742f2f5e680b87	9532d757-75a6-4bca-8c8a-73ba6b8d6547	{"pocket": 3, "betType": "color", "betValue": "red", "userMeta": {"betType": "color", "betValue": "red"}}	2026-06-04 02:41:49.321056+00
9	1	5	1.00000000	0.00000000	f	0.0000	e0ec44c17b72427f9bfe27dd38ce31b3	9125d9e8-32ec-4cfb-9cf6-1c872617b4cb	{"pocket": 2, "betType": "color", "betValue": "red", "userMeta": {"betType": "color", "betValue": "red"}}	2026-06-04 02:41:55.321095+00
10	1	5	995.94600000	0.00000000	f	0.0000	435ec810a56c405b92c520e858f53f9f	fea796ae-af84-4d9f-90d5-731fd9089819	{"pocket": 13, "betType": "color", "betValue": "red", "userMeta": {"betType": "color", "betValue": "red"}}	2026-06-04 02:42:13.621142+00
11	1	5	4.00000000	7.78400000	t	1.9460	733a209822a74722b81007cd56a9cf00	a27aa3a3-c82e-41d4-8506-8fe65f154d1c	{"pocket": 16, "betType": "color", "betValue": "red", "userMeta": {"betType": "color", "betValue": "red"}}	2026-06-04 03:45:10.642781+00
12	1	5	1.00000000	1.94600000	t	1.9460	2662b8beae604dfda5608cdd8be8753b	d9b1afe9-1b2e-40e5-9c44-9a8bbd3ef29d	{"pocket": 18, "betType": "color", "betValue": "red", "userMeta": {"betType": "color", "betValue": "red"}}	2026-06-04 03:45:28.938048+00
13	1	5	1.00000000	1.94600000	t	1.9460	0b6e966964ca4b82a9de9d4e301e4b0b	142928fd-8432-4039-9f25-8f19ac03a4bf	{"pocket": 18, "betType": "color", "betValue": "red", "userMeta": {"betType": "color", "betValue": "red"}}	2026-06-04 03:45:37.367789+00
14	1	4	0.50000000	0.00000000	f	0.0000	7ebdc9ba2d7e411bb3095cd3b3b83446	e3def1de-826b-48fa-a7f8-b35bda3ba518	{"reels": ["CHERRY", "CHERRY", "BELL"]}	2026-06-04 15:40:05.4754+00
15	1	4	0.50000000	0.00000000	f	0.0000	ffa9ffe46b6b4346a763bde56c19c9b8	251fbb2a-a0d8-4ca0-bf33-741c1cb9fc3c	{"reels": ["LEMON", "BELL", "LEMON"]}	2026-06-04 15:40:09.509804+00
16	1	4	0.50000000	0.00000000	f	0.0000	0f3299daccda4200b922471110a2ba48	7212ad11-5221-4518-a558-bc37431376ae	{"reels": ["BAR", "BAR", "CHERRY"]}	2026-06-04 15:40:12.906704+00
17	1	4	500.00000000	0.00000000	f	0.0000	eaeaac8c08e0433fb6edb98583ee3a24	13b6819a-560a-441f-8651-0ce645239b43	{"reels": ["LEMON", "BAR", "BELL"]}	2026-06-04 15:40:22.245487+00
18	1	5	1.00000000	1.94600000	t	1.9460	7b0570b6e60e496d95eba11ff4e4be75	daea3b43-26f6-4b0a-b9a5-206565983d6d	{"pocket": 28, "betType": "evenodd", "betValue": "even", "userMeta": {"betType": "evenodd", "betValue": "even"}}	2026-06-04 15:59:58.580139+00
19	1	5	1.00000000	0.00000000	f	0.0000	ce492979e69f4f38b1dbf51392cbbd15	a6577909-2a6d-4ed5-89a9-440aaec496d4	{"pocket": 17, "betType": "color", "betValue": "red", "userMeta": {"betType": "color", "betValue": "red"}}	2026-06-04 16:00:12.243931+00
20	1	5	1.00000000	0.00000000	f	0.0000	ce541d81b8274e399929bdef88296b8d	fdae9074-6a0b-4cfa-88e2-5f9260355620	{"pocket": 15, "betType": "color", "betValue": "red", "userMeta": {"betType": "color", "betValue": "red"}}	2026-06-04 16:03:34.551522+00
21	1	5	1.00000000	1.94600000	t	1.9460	482dac4e5e0d481a8a8929b9e868f628	3f949348-bcbf-4ce5-a597-fa9b36745b7c	{"pocket": 21, "betType": "color", "betValue": "red", "userMeta": {"betType": "color", "betValue": "red"}}	2026-06-04 16:03:44.379063+00
22	1	6	10.00000000	0.00000000	f	0.0000	381acde0b9274f68a845b43bbf7ecf2d	mines	{"result": "busted", "revealed": [22], "minePositions": [15, 19, 6, 4, 3, 22, 7, 11, 23, 10, 12]}	2026-06-04 16:04:09.153205+00
23	1	6	10.00000000	0.00000000	f	0.0000	a43e67b62aab4809b97c280dc5e49899	mines	{"result": "busted", "revealed": [24, 19], "minePositions": [3, 2, 5, 19, 23, 13, 12, 7, 22, 11, 18]}	2026-06-04 16:04:21.660889+00
24	1	6	10.00000000	0.00000000	f	0.0000	95079cc94456451a9f408fac808e753c	mines	{"result": "busted", "revealed": [21], "minePositions": [20, 11, 6, 2, 13, 3, 17, 21, 4, 19, 23]}	2026-06-04 16:04:31.015153+00
25	1	6	10.00000000	0.00000000	f	0.0000	da025703fc1947fd85869539c284f337	mines	{"result": "busted", "revealed": [17, 22], "minePositions": [14, 12, 10, 11, 5, 15, 22, 18, 16, 0, 20]}	2026-06-04 16:04:38.029762+00
26	1	6	10.00000000	17.32100000	t	1.7321	cc63d6474a5346538ac59ff851e97d23	mines	{"result": "cashed_out", "revealed": [24], "multiplier": 1.7321, "minePositions": [5, 3, 7, 0, 15, 20, 17, 11, 2, 23, 16]}	2026-06-04 16:04:45.481124+00
27	1	6	10.00000000	17.32100000	t	1.7321	74372320eaf14ba6abea6631aa87e1de	mines	{"result": "cashed_out", "revealed": [16], "multiplier": 1.7321, "minePositions": [10, 22, 23, 2, 11, 6, 20, 8, 13, 5, 19]}	2026-06-04 16:04:52.752951+00
28	1	6	10.00000000	31.97800000	t	3.1978	54f7bcbf3cc446dc9f49a5cf967f1d46	mines	{"result": "cashed_out", "revealed": [8, 12], "multiplier": 3.1978, "minePositions": [24, 14, 13, 16, 1, 22, 17, 9, 19, 15, 4]}	2026-06-04 16:05:01.478945+00
29	1	7	8.00000000	16.00000000	t	2.0000	dc62cc9570e34058a7f2f69db7ca9151	blackjack	{"action": "stand", "result": "player_wins", "dealerHand": [{"rank": "4", "suit": "♠"}, {"rank": "2", "suit": "♦"}, {"rank": "9", "suit": "♦"}, {"rank": "A", "suit": "♥"}, {"rank": "7", "suit": "♥"}], "playerHand": [{"rank": "10", "suit": "♣"}, {"rank": "3", "suit": "♦"}]}	2026-06-04 16:05:14.2479+00
30	1	7	100.00000000	0.00000000	f	0.0000	1683cd3fe9b0490cad3c4931abd0d5f0	blackjack	{"action": "stand", "result": "dealer_wins", "dealerHand": [{"rank": "2", "suit": "♠"}, {"rank": "4", "suit": "♣"}, {"rank": "6", "suit": "♦"}, {"rank": "5", "suit": "♣"}], "playerHand": [{"rank": "7", "suit": "♥"}, {"rank": "8", "suit": "♥"}]}	2026-06-04 16:05:25.529102+00
31	1	7	100.00000000	0.00000000	f	0.0000	a4515e5c6cbf4d978ebeff9ffd3ecb4f	blackjack	{"action": "stand", "result": "dealer_wins", "dealerHand": [{"rank": "3", "suit": "♣"}, {"rank": "J", "suit": "♦"}, {"rank": "3", "suit": "♦"}, {"rank": "4", "suit": "♦"}], "playerHand": [{"rank": "8", "suit": "♥"}, {"rank": "8", "suit": "♦"}]}	2026-06-04 16:05:31.019755+00
32	1	7	308.00000000	616.00000000	t	2.0000	a6783074d8584edd8d162cd8a1c6b822	blackjack	{"action": "stand", "result": "player_wins", "dealerHand": [{"rank": "J", "suit": "♦"}, {"rank": "3", "suit": "♦"}, {"rank": "A", "suit": "♣"}, {"rank": "5", "suit": "♠"}], "playerHand": [{"rank": "4", "suit": "♣"}, {"rank": "6", "suit": "♥"}, {"rank": "A", "suit": "♦"}]}	2026-06-04 16:05:47.039121+00
\.


--
-- Data for Name: blackjack_hands; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.blackjack_hands (id, user_id, game_id, bet, server_seed, deck_state, player_hand, dealer_hand, status, created_at, updated_at) FROM stdin;
1	1	7	1.00000000	1f38ded13c6b4359b6f7e6051249ca67	[{"suit":"♠","rank":"3"},{"suit":"♠","rank":"7"},{"suit":"♣","rank":"9"},{"suit":"♥","rank":"9"},{"suit":"♦","rank":"A"},{"suit":"♣","rank":"4"},{"suit":"♦","rank":"J"},{"suit":"♣","rank":"6"},{"suit":"♠","rank":"6"},{"suit":"♣","rank":"10"},{"suit":"♠","rank":"8"},{"suit":"♣","rank":"Q"},{"suit":"♣","rank":"A"},{"suit":"♥","rank":"Q"},{"suit":"♠","rank":"K"},{"suit":"♠","rank":"2"},{"suit":"♦","rank":"8"},{"suit":"♦","rank":"2"},{"suit":"♣","rank":"2"},{"suit":"♠","rank":"Q"},{"suit":"♦","rank":"Q"},{"suit":"♠","rank":"9"},{"suit":"♦","rank":"6"},{"suit":"♣","rank":"3"},{"suit":"♠","rank":"10"},{"suit":"♦","rank":"7"},{"suit":"♥","rank":"6"},{"suit":"♥","rank":"3"},{"suit":"♥","rank":"8"},{"suit":"♥","rank":"5"},{"suit":"♦","rank":"10"},{"suit":"♥","rank":"2"},{"suit":"♠","rank":"4"},{"suit":"♦","rank":"3"},{"suit":"♦","rank":"K"},{"suit":"♥","rank":"7"},{"suit":"♥","rank":"4"},{"suit":"♥","rank":"A"},{"suit":"♣","rank":"K"},{"suit":"♣","rank":"5"},{"suit":"♣","rank":"7"},{"suit":"♣","rank":"8"},{"suit":"♠","rank":"A"},{"suit":"♣","rank":"J"},{"suit":"♥","rank":"10"},{"suit":"♠","rank":"J"},{"suit":"♠","rank":"5"},{"suit":"♦","rank":"5"}]	[{"suit":"♦","rank":"4"},{"suit":"♥","rank":"J"}]	[{"suit":"♥","rank":"K"},{"suit":"♦","rank":"9"}]	dealer_wins	2026-06-04 02:33:07.058028+00	2026-06-04 02:33:10.332+00
2	1	7	8.00000000	dc62cc9570e34058a7f2f69db7ca9151	[{"suit":"♠","rank":"A"},{"suit":"♥","rank":"10"},{"suit":"♠","rank":"K"},{"suit":"♦","rank":"A"},{"suit":"♠","rank":"3"},{"suit":"♣","rank":"8"},{"suit":"♣","rank":"4"},{"suit":"♣","rank":"6"},{"suit":"♥","rank":"4"},{"suit":"♠","rank":"J"},{"suit":"♣","rank":"7"},{"suit":"♣","rank":"A"},{"suit":"♥","rank":"3"},{"suit":"♠","rank":"Q"},{"suit":"♥","rank":"6"},{"suit":"♥","rank":"Q"},{"suit":"♥","rank":"2"},{"suit":"♠","rank":"7"},{"suit":"♠","rank":"9"},{"suit":"♦","rank":"8"},{"suit":"♦","rank":"K"},{"suit":"♠","rank":"6"},{"suit":"♠","rank":"5"},{"suit":"♦","rank":"10"},{"suit":"♣","rank":"J"},{"suit":"♦","rank":"6"},{"suit":"♥","rank":"5"},{"suit":"♦","rank":"J"},{"suit":"♣","rank":"Q"},{"suit":"♣","rank":"3"},{"suit":"♠","rank":"8"},{"suit":"♠","rank":"2"},{"suit":"♥","rank":"J"},{"suit":"♦","rank":"4"},{"suit":"♣","rank":"2"},{"suit":"♣","rank":"5"},{"suit":"♣","rank":"K"},{"suit":"♣","rank":"9"},{"suit":"♠","rank":"10"},{"suit":"♦","rank":"5"},{"suit":"♦","rank":"7"},{"suit":"♥","rank":"K"},{"suit":"♦","rank":"Q"},{"suit":"♥","rank":"8"},{"suit":"♥","rank":"9"}]	[{"suit":"♣","rank":"10"},{"suit":"♦","rank":"3"}]	[{"suit":"♠","rank":"4"},{"suit":"♦","rank":"2"},{"suit":"♦","rank":"9"},{"suit":"♥","rank":"A"},{"suit":"♥","rank":"7"}]	player_wins	2026-06-04 03:45:55.449809+00	2026-06-04 16:05:14.251+00
3	1	7	100.00000000	1683cd3fe9b0490cad3c4931abd0d5f0	[{"suit":"♠","rank":"J"},{"suit":"♣","rank":"8"},{"suit":"♦","rank":"J"},{"suit":"♠","rank":"6"},{"suit":"♦","rank":"5"},{"suit":"♣","rank":"2"},{"suit":"♦","rank":"4"},{"suit":"♠","rank":"4"},{"suit":"♣","rank":"A"},{"suit":"♥","rank":"3"},{"suit":"♠","rank":"Q"},{"suit":"♣","rank":"6"},{"suit":"♦","rank":"10"},{"suit":"♠","rank":"5"},{"suit":"♣","rank":"9"},{"suit":"♦","rank":"7"},{"suit":"♣","rank":"7"},{"suit":"♠","rank":"10"},{"suit":"♦","rank":"Q"},{"suit":"♥","rank":"Q"},{"suit":"♠","rank":"8"},{"suit":"♠","rank":"3"},{"suit":"♥","rank":"K"},{"suit":"♦","rank":"8"},{"suit":"♠","rank":"7"},{"suit":"♦","rank":"9"},{"suit":"♥","rank":"9"},{"suit":"♥","rank":"2"},{"suit":"♣","rank":"10"},{"suit":"♦","rank":"3"},{"suit":"♥","rank":"4"},{"suit":"♥","rank":"5"},{"suit":"♠","rank":"9"},{"suit":"♥","rank":"J"},{"suit":"♦","rank":"A"},{"suit":"♥","rank":"A"},{"suit":"♠","rank":"A"},{"suit":"♥","rank":"10"},{"suit":"♥","rank":"6"},{"suit":"♣","rank":"Q"},{"suit":"♣","rank":"J"},{"suit":"♦","rank":"2"},{"suit":"♣","rank":"K"},{"suit":"♦","rank":"K"},{"suit":"♣","rank":"3"},{"suit":"♠","rank":"K"}]	[{"suit":"♥","rank":"7"},{"suit":"♥","rank":"8"}]	[{"suit":"♠","rank":"2"},{"suit":"♣","rank":"4"},{"suit":"♦","rank":"6"},{"suit":"♣","rank":"5"}]	dealer_wins	2026-06-04 16:05:23.596754+00	2026-06-04 16:05:25.531+00
4	1	7	100.00000000	a4515e5c6cbf4d978ebeff9ffd3ecb4f	[{"suit":"♣","rank":"6"},{"suit":"♠","rank":"A"},{"suit":"♦","rank":"6"},{"suit":"♣","rank":"J"},{"suit":"♣","rank":"A"},{"suit":"♥","rank":"5"},{"suit":"♠","rank":"6"},{"suit":"♠","rank":"8"},{"suit":"♠","rank":"7"},{"suit":"♠","rank":"3"},{"suit":"♥","rank":"K"},{"suit":"♥","rank":"J"},{"suit":"♥","rank":"3"},{"suit":"♣","rank":"8"},{"suit":"♠","rank":"J"},{"suit":"♥","rank":"Q"},{"suit":"♥","rank":"2"},{"suit":"♠","rank":"5"},{"suit":"♣","rank":"9"},{"suit":"♣","rank":"10"},{"suit":"♠","rank":"10"},{"suit":"♥","rank":"10"},{"suit":"♠","rank":"9"},{"suit":"♥","rank":"A"},{"suit":"♣","rank":"4"},{"suit":"♦","rank":"5"},{"suit":"♦","rank":"7"},{"suit":"♣","rank":"2"},{"suit":"♣","rank":"Q"},{"suit":"♦","rank":"9"},{"suit":"♥","rank":"7"},{"suit":"♠","rank":"4"},{"suit":"♦","rank":"K"},{"suit":"♠","rank":"K"},{"suit":"♦","rank":"Q"},{"suit":"♣","rank":"7"},{"suit":"♣","rank":"K"},{"suit":"♦","rank":"A"},{"suit":"♦","rank":"2"},{"suit":"♥","rank":"4"},{"suit":"♥","rank":"9"},{"suit":"♠","rank":"Q"},{"suit":"♠","rank":"2"},{"suit":"♥","rank":"6"},{"suit":"♦","rank":"10"},{"suit":"♣","rank":"5"}]	[{"suit":"♥","rank":"8"},{"suit":"♦","rank":"8"}]	[{"suit":"♣","rank":"3"},{"suit":"♦","rank":"J"},{"suit":"♦","rank":"3"},{"suit":"♦","rank":"4"}]	dealer_wins	2026-06-04 16:05:28.191235+00	2026-06-04 16:05:31.023+00
5	1	7	308.00000000	a6783074d8584edd8d162cd8a1c6b822	[{"suit":"♥","rank":"A"},{"suit":"♥","rank":"2"},{"suit":"♠","rank":"2"},{"suit":"♠","rank":"A"},{"suit":"♥","rank":"7"},{"suit":"♦","rank":"Q"},{"suit":"♣","rank":"J"},{"suit":"♥","rank":"Q"},{"suit":"♠","rank":"10"},{"suit":"♦","rank":"10"},{"suit":"♣","rank":"6"},{"suit":"♦","rank":"K"},{"suit":"♠","rank":"K"},{"suit":"♣","rank":"5"},{"suit":"♠","rank":"6"},{"suit":"♣","rank":"Q"},{"suit":"♥","rank":"4"},{"suit":"♦","rank":"4"},{"suit":"♦","rank":"9"},{"suit":"♦","rank":"8"},{"suit":"♠","rank":"9"},{"suit":"♠","rank":"4"},{"suit":"♥","rank":"10"},{"suit":"♠","rank":"J"},{"suit":"♠","rank":"7"},{"suit":"♠","rank":"Q"},{"suit":"♠","rank":"3"},{"suit":"♥","rank":"5"},{"suit":"♦","rank":"6"},{"suit":"♥","rank":"9"},{"suit":"♣","rank":"3"},{"suit":"♦","rank":"7"},{"suit":"♦","rank":"2"},{"suit":"♣","rank":"8"},{"suit":"♣","rank":"10"},{"suit":"♣","rank":"2"},{"suit":"♥","rank":"K"},{"suit":"♦","rank":"5"},{"suit":"♣","rank":"7"},{"suit":"♥","rank":"8"},{"suit":"♠","rank":"8"},{"suit":"♥","rank":"3"},{"suit":"♣","rank":"K"},{"suit":"♥","rank":"J"},{"suit":"♣","rank":"9"}]	[{"suit":"♣","rank":"4"},{"suit":"♥","rank":"6"},{"suit":"♦","rank":"A"}]	[{"suit":"♦","rank":"J"},{"suit":"♦","rank":"3"},{"suit":"♣","rank":"A"},{"suit":"♠","rank":"5"}]	player_wins	2026-06-04 16:05:43.829561+00	2026-06-04 16:05:47.042+00
\.


--
-- Data for Name: daily_bonus_claims; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.daily_bonus_claims (id, user_id, amount, claimed_date, created_at) FROM stdin;
1	1	2.00000000	2026-06-04	2026-06-04 16:05:54.838369+00
\.


--
-- Data for Name: games; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.games (id, slug, name, description, image_url, min_bet, max_bet, house_edge, active, created_at) FROM stdin;
1	coin-flip	Coin Flip	Classic heads or tails — 50/50 chance with 1.96x payout. Simple, fast, and fair.	\N	0.50000000	1000.00000000	0.0400	t	2026-06-03 23:55:25.228208+00
3	crash	Crash	Watch the multiplier grow and cash out before it crashes. The longer you wait, the bigger the reward.	\N	1.00000000	5000.00000000	0.0500	t	2026-06-03 23:55:25.228208+00
4	slots	Lucky Slots	Spin the reels for a chance at massive multipliers. Match symbols and win up to 100x your bet.	\N	0.50000000	500.00000000	0.0500	t	2026-06-03 23:55:25.228208+00
7	blackjack	Blackjack	Beat the dealer to 21. Hit, Stand, or Double Down.	\N	1.00000000	5000.00000000	0.0050	t	2026-06-04 02:15:33.420884+00
5	roulette	Roulette	Spin the wheel. Bet on numbers, colors, or sections.	\N	1.00000000	2000.00000000	0.0270	t	2026-06-03 23:55:25.228208+00
6	mines	Mines	Navigate the minefield. Every safe cell multiplies your bet.	\N	1.00000000	1000.00000000	0.0500	t	2026-06-03 23:55:25.228208+00
10	plinko	Plinko	Drop the ball through pegs. Land on high multipliers.	\N	0.50000000	5000.00000000	0.0300	t	2026-06-04 02:15:33.420884+00
11	hilo	Hi-Lo	Guess if the next card is Higher or Lower.	\N	0.50000000	2000.00000000	0.0300	t	2026-06-04 02:15:33.420884+00
12	keno	Keno	Pick your numbers. Match up to 10 for massive payouts.	\N	0.50000000	1000.00000000	0.0500	t	2026-06-04 02:15:33.420884+00
2	dice	Dice	Roll over or under. Set your target for custom odds.	\N	0.50000000	1000.00000000	0.0300	t	2026-06-03 23:55:25.228208+00
14	race	Horse Race	Pick your horse. First to cross the finish line wins 5.5x!	\N	1.00000000	1000.00000000	0.0830	t	2026-06-04 02:43:11.164746+00
\.


--
-- Data for Name: mines_sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.mines_sessions (id, user_id, game_id, bet, server_seed, mine_count, mine_positions, revealed, status, current_multiplier, created_at) FROM stdin;
1	1	6	10.00000000	381acde0b9274f68a845b43bbf7ecf2d	11	[15,19,6,4,3,22,7,11,23,10,12]	[22]	busted	1.0000	2026-06-04 16:04:07.938206+00
2	1	6	10.00000000	a43e67b62aab4809b97c280dc5e49899	11	[3,2,5,19,23,13,12,7,22,11,18]	[24,19]	busted	1.7321	2026-06-04 16:04:14.714294+00
3	1	6	10.00000000	95079cc94456451a9f408fac808e753c	11	[20,11,6,2,13,3,17,21,4,19,23]	[21]	busted	1.0000	2026-06-04 16:04:29.892505+00
4	1	6	10.00000000	da025703fc1947fd85869539c284f337	11	[14,12,10,11,5,15,22,18,16,0,20]	[17,22]	busted	1.7321	2026-06-04 16:04:35.134933+00
5	1	6	10.00000000	cc63d6474a5346538ac59ff851e97d23	11	[5,3,7,0,15,20,17,11,2,23,16]	[24]	won	1.7321	2026-06-04 16:04:42.183504+00
6	1	6	10.00000000	74372320eaf14ba6abea6631aa87e1de	11	[10,22,23,2,11,6,20,8,13,5,19]	[16]	won	1.7321	2026-06-04 16:04:50.644038+00
7	1	6	10.00000000	54f7bcbf3cc446dc9f49a5cf967f1d46	11	[24,14,13,16,1,22,17,9,19,15,4]	[8,12]	won	3.1978	2026-06-04 16:04:57.407494+00
\.


--
-- Data for Name: transactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.transactions (id, user_id, type, amount, currency, status, tx_hash, address, oxapay_track_id, order_id, created_at, updated_at) FROM stdin;
1	1	deposit	50.00000000	BTC	pending	\N	\N	114834949	71fabed8-a338-4c99-8bfc-279218557aa1	2026-06-04 00:04:49.476743+00	2026-06-04 00:04:49.476743+00
2	1	withdrawal	1000.00000000	BTC	failed	\N	bc1qz8yqllz3ygpmwuph9ntvqlzd74whfvgzfkt4tz	\N	\N	2026-06-04 00:06:38.688742+00	2026-06-04 00:06:55.09+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, username, password_hash, balance, avatar_url, total_bets, total_won, role, is_banned, created_at, updated_at) FROM stdin;
1	fanodgc	$2b$12$Br1Q4QrkOWscE3CFkACQQu/dnuWbPQIJnfXT5VBxP2/S6o76dA1TK	618.68800000	\N	32	718.13400000	admin	f	2026-06-03 23:57:50.852253+00	2026-06-04 16:05:54.834+00
\.


--
-- Name: bets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.bets_id_seq', 32, true);


--
-- Name: blackjack_hands_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.blackjack_hands_id_seq', 5, true);


--
-- Name: daily_bonus_claims_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.daily_bonus_claims_id_seq', 1, true);


--
-- Name: games_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.games_id_seq', 14, true);


--
-- Name: mines_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.mines_sessions_id_seq', 7, true);


--
-- Name: transactions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.transactions_id_seq', 2, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_id_seq', 1, true);


--
-- Name: bets bets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bets
    ADD CONSTRAINT bets_pkey PRIMARY KEY (id);


--
-- Name: blackjack_hands blackjack_hands_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blackjack_hands
    ADD CONSTRAINT blackjack_hands_pkey PRIMARY KEY (id);


--
-- Name: daily_bonus_claims daily_bonus_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_bonus_claims
    ADD CONSTRAINT daily_bonus_claims_pkey PRIMARY KEY (id);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (id);


--
-- Name: games games_slug_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.games
    ADD CONSTRAINT games_slug_unique UNIQUE (slug);


--
-- Name: mines_sessions mines_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mines_sessions
    ADD CONSTRAINT mines_sessions_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: bets bets_game_id_games_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bets
    ADD CONSTRAINT bets_game_id_games_id_fk FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- Name: bets bets_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.bets
    ADD CONSTRAINT bets_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: blackjack_hands blackjack_hands_game_id_games_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blackjack_hands
    ADD CONSTRAINT blackjack_hands_game_id_games_id_fk FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- Name: blackjack_hands blackjack_hands_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.blackjack_hands
    ADD CONSTRAINT blackjack_hands_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: daily_bonus_claims daily_bonus_claims_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.daily_bonus_claims
    ADD CONSTRAINT daily_bonus_claims_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: mines_sessions mines_sessions_game_id_games_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mines_sessions
    ADD CONSTRAINT mines_sessions_game_id_games_id_fk FOREIGN KEY (game_id) REFERENCES public.games(id);


--
-- Name: mines_sessions mines_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.mines_sessions
    ADD CONSTRAINT mines_sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: transactions transactions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict dGPr9nVPU6eu488c2nUuHujMloKgF90NKK8f7uL6u5jiczq55zbfcrIdStU8sIL

