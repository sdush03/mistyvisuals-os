--
-- PostgreSQL database dump
--

\restrict uIIjYEAKKTINXuoL3lcwEIwErBAyJSe5pfj2J2eFqhSlD7mtMNUVLwkHIKdWfzw

-- Dumped from database version 18.1 (Postgres.app)
-- Dumped by pg_dump version 18.1 (Postgres.app)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: deliverable_category; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.deliverable_category AS ENUM (
    'PHOTO',
    'VIDEO',
    'OTHER',
    'ADDON'
);


ALTER TYPE public.deliverable_category OWNER TO postgres;

--
-- Name: negotiation_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.negotiation_type AS ENUM (
    'CLIENT_FEEDBACK',
    'DISCOUNT_REQUEST',
    'COVERAGE_CHANGE',
    'INTERNAL_NOTE'
);


ALTER TYPE public.negotiation_type OWNER TO postgres;

--
-- Name: pricing_item_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.pricing_item_type AS ENUM (
    'TEAM_ROLE',
    'DELIVERABLE'
);


ALTER TYPE public.pricing_item_type OWNER TO postgres;

--
-- Name: quote_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.quote_status AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'SENT',
    'ADVANCE_AWAITING',
    'ACCEPTED',
    'REJECTED',
    'EXPIRED',
    'ADMIN_REJECTED',
    'SUPERSEDED'
);


ALTER TYPE public.quote_status OWNER TO postgres;

--
-- Name: unit_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.unit_type AS ENUM (
    'PER_DAY',
    'PER_UNIT',
    'FLAT'
);


ALTER TYPE public.unit_type OWNER TO postgres;

--
-- Name: enforce_freelancer_vendor_rate_card(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enforce_freelancer_vendor_rate_card() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  vtype TEXT;
BEGIN
  SELECT vendor_type INTO vtype FROM vendors WHERE id = NEW.vendor_id;
  IF vtype IS NULL THEN
    RAISE EXCEPTION 'Vendor not found';
  END IF;
  IF vtype <> 'freelancer' THEN
    RAISE EXCEPTION 'Rate cards allowed only for freelancer vendors';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.enforce_freelancer_vendor_rate_card() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_audit_log (
    id integer NOT NULL,
    user_id integer,
    action text,
    ip text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.admin_audit_log OWNER TO postgres;

--
-- Name: admin_audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.admin_audit_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.admin_audit_log_id_seq OWNER TO postgres;

--
-- Name: admin_audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.admin_audit_log_id_seq OWNED BY public.admin_audit_log.id;


--
-- Name: cities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cities (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    state_id integer,
    created_at timestamp with time zone DEFAULT now(),
    state character varying(100),
    country character varying(100) DEFAULT 'India'::character varying
);


ALTER TABLE public.cities OWNER TO postgres;

--
-- Name: cities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cities_id_seq OWNER TO postgres;

--
-- Name: cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cities_id_seq OWNED BY public.cities.id;


--
-- Name: deliverable_catalog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deliverable_catalog (
    id integer NOT NULL,
    name text NOT NULL,
    price numeric(65,30) NOT NULL,
    unit_type public.unit_type NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    category public.deliverable_category DEFAULT 'OTHER'::public.deliverable_category NOT NULL,
    description text,
    delivery_timeline text
);


ALTER TABLE public.deliverable_catalog OWNER TO postgres;

--
-- Name: deliverable_catalog_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.deliverable_catalog_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.deliverable_catalog_id_seq OWNER TO postgres;

--
-- Name: deliverable_catalog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.deliverable_catalog_id_seq OWNED BY public.deliverable_catalog.id;


--
-- Name: finance_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.finance_categories (
    id integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    parent_id integer,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.finance_categories OWNER TO postgres;

--
-- Name: finance_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.finance_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.finance_categories_id_seq OWNER TO postgres;

--
-- Name: finance_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.finance_categories_id_seq OWNED BY public.finance_categories.id;


--
-- Name: finance_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.finance_transactions (
    id integer NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    type text,
    category_id integer,
    description text,
    date date,
    project_id integer,
    vendor_id integer,
    user_id integer,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.finance_transactions OWNER TO postgres;

--
-- Name: finance_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.finance_transactions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.finance_transactions_id_seq OWNER TO postgres;

--
-- Name: finance_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.finance_transactions_id_seq OWNED BY public.finance_transactions.id;


--
-- Name: indian_states; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.indian_states (
    id integer NOT NULL,
    name text NOT NULL,
    country text DEFAULT 'India'::text NOT NULL
);


ALTER TABLE public.indian_states OWNER TO postgres;

--
-- Name: indian_states_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.indian_states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.indian_states_id_seq OWNER TO postgres;

--
-- Name: indian_states_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.indian_states_id_seq OWNED BY public.indian_states.id;


--
-- Name: invoice_line_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_line_items (
    id integer NOT NULL,
    invoice_id integer,
    description text,
    amount numeric(12,2),
    quantity integer DEFAULT 1
);


ALTER TABLE public.invoice_line_items OWNER TO postgres;

--
-- Name: invoice_line_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoice_line_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoice_line_items_id_seq OWNER TO postgres;

--
-- Name: invoice_line_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invoice_line_items_id_seq OWNED BY public.invoice_line_items.id;


--
-- Name: invoice_payment_schedule; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_payment_schedule (
    id integer NOT NULL,
    invoice_id integer,
    due_date date,
    amount numeric(12,2),
    status text DEFAULT 'pending'::text
);


ALTER TABLE public.invoice_payment_schedule OWNER TO postgres;

--
-- Name: invoice_payment_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoice_payment_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoice_payment_schedule_id_seq OWNER TO postgres;

--
-- Name: invoice_payment_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invoice_payment_schedule_id_seq OWNED BY public.invoice_payment_schedule.id;


--
-- Name: invoice_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_payments (
    id integer NOT NULL,
    invoice_id integer,
    amount numeric(12,2),
    paid_at timestamp with time zone DEFAULT now(),
    method text,
    note text
);


ALTER TABLE public.invoice_payments OWNER TO postgres;

--
-- Name: invoice_payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoice_payments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoice_payments_id_seq OWNER TO postgres;

--
-- Name: invoice_payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invoice_payments_id_seq OWNED BY public.invoice_payments.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    lead_id integer,
    quote_group_id integer,
    total_amount numeric(12,2),
    status text DEFAULT 'draft'::text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.invoices OWNER TO postgres;

--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoices_id_seq OWNER TO postgres;

--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: known_internal_ips; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.known_internal_ips (
    ip text NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.known_internal_ips OWNER TO postgres;

--
-- Name: lead_activities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_activities (
    id integer NOT NULL,
    lead_id integer,
    activity_type text NOT NULL,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now(),
    user_id integer
);


ALTER TABLE public.lead_activities OWNER TO postgres;

--
-- Name: lead_activities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_activities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_activities_id_seq OWNER TO postgres;

--
-- Name: lead_activities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_activities_id_seq OWNED BY public.lead_activities.id;


--
-- Name: lead_cities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_cities (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    city_id integer NOT NULL,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.lead_cities OWNER TO postgres;

--
-- Name: lead_cities_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_cities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_cities_id_seq OWNER TO postgres;

--
-- Name: lead_cities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_cities_id_seq OWNED BY public.lead_cities.id;


--
-- Name: lead_enrichment_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_enrichment_logs (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    payload jsonb,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.lead_enrichment_logs OWNER TO postgres;

--
-- Name: lead_enrichment_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_enrichment_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_enrichment_logs_id_seq OWNER TO postgres;

--
-- Name: lead_enrichment_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_enrichment_logs_id_seq OWNED BY public.lead_enrichment_logs.id;


--
-- Name: lead_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_events (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    event_type character varying(100),
    event_date date,
    pax integer,
    venue character varying(200),
    description text,
    start_time character varying(10),
    end_time character varying(10),
    slot character varying(50),
    city_id integer,
    venue_id integer,
    venue_metadata jsonb,
    date_status character varying(20) DEFAULT 'confirmed'::character varying,
    "position" integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.lead_events OWNER TO postgres;

--
-- Name: lead_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_events_id_seq OWNER TO postgres;

--
-- Name: lead_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_events_id_seq OWNED BY public.lead_events.id;


--
-- Name: lead_followups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_followups (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    follow_up_at timestamp with time zone NOT NULL,
    type text NOT NULL,
    note text,
    outcome text,
    follow_up_mode text,
    discussed_topics jsonb,
    not_connected_reason text,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.lead_followups OWNER TO postgres;

--
-- Name: lead_followups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_followups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_followups_id_seq OWNER TO postgres;

--
-- Name: lead_followups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_followups_id_seq OWNED BY public.lead_followups.id;


--
-- Name: lead_lost_reasons; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_lost_reasons (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    reason text NOT NULL,
    note text,
    user_id integer,
    lost_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.lead_lost_reasons OWNER TO postgres;

--
-- Name: lead_lost_reasons_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_lost_reasons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_lost_reasons_id_seq OWNER TO postgres;

--
-- Name: lead_lost_reasons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_lost_reasons_id_seq OWNED BY public.lead_lost_reasons.id;


--
-- Name: lead_metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_metrics (
    lead_id integer NOT NULL,
    total_followups integer DEFAULT 0 NOT NULL,
    connected_followups integer DEFAULT 0 NOT NULL,
    not_connected_count integer DEFAULT 0 NOT NULL,
    avg_days_between_followups numeric,
    total_time_spent_seconds integer DEFAULT 0 NOT NULL,
    last_activity_at timestamp without time zone,
    days_to_first_contact numeric,
    days_to_conversion numeric,
    reopen_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.lead_metrics OWNER TO postgres;

--
-- Name: lead_negotiations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_negotiations (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    topic text NOT NULL,
    note text NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.lead_negotiations OWNER TO postgres;

--
-- Name: lead_negotiations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_negotiations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_negotiations_id_seq OWNER TO postgres;

--
-- Name: lead_negotiations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_negotiations_id_seq OWNED BY public.lead_negotiations.id;


--
-- Name: lead_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_notes (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    note_text text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    status_at_time text,
    user_id integer
);


ALTER TABLE public.lead_notes OWNER TO postgres;

--
-- Name: lead_notes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_notes_id_seq OWNER TO postgres;

--
-- Name: lead_notes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_notes_id_seq OWNED BY public.lead_notes.id;


--
-- Name: lead_pricing_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_pricing_logs (
    id integer NOT NULL,
    lead_id integer,
    field_type text,
    amount numeric NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    user_id integer,
    CONSTRAINT lead_pricing_logs_field_type_check CHECK ((field_type = ANY (ARRAY['client_offer'::text, 'discounted'::text])))
);


ALTER TABLE public.lead_pricing_logs OWNER TO postgres;

--
-- Name: lead_pricing_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_pricing_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_pricing_logs_id_seq OWNER TO postgres;

--
-- Name: lead_pricing_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_pricing_logs_id_seq OWNED BY public.lead_pricing_logs.id;


--
-- Name: lead_quotes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_quotes (
    id integer NOT NULL,
    lead_id integer,
    quote_number text NOT NULL,
    generated_text text NOT NULL,
    amount_quoted numeric,
    discounted_amount numeric,
    created_at timestamp without time zone DEFAULT now(),
    created_by integer
);


ALTER TABLE public.lead_quotes OWNER TO postgres;

--
-- Name: lead_quotes_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_quotes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_quotes_id_seq OWNER TO postgres;

--
-- Name: lead_quotes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_quotes_id_seq OWNED BY public.lead_quotes.id;


--
-- Name: lead_usage_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lead_usage_logs (
    id integer NOT NULL,
    user_id integer NOT NULL,
    lead_id integer NOT NULL,
    entered_at timestamp without time zone DEFAULT now() NOT NULL,
    left_at timestamp without time zone,
    duration_seconds integer
);


ALTER TABLE public.lead_usage_logs OWNER TO postgres;

--
-- Name: lead_usage_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lead_usage_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lead_usage_logs_id_seq OWNER TO postgres;

--
-- Name: lead_usage_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lead_usage_logs_id_seq OWNED BY public.lead_usage_logs.id;


--
-- Name: leads; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.leads (
    id integer NOT NULL,
    name text NOT NULL,
    source text NOT NULL,
    status text DEFAULT 'New'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    previous_status text,
    updated_at timestamp without time zone DEFAULT now(),
    heat text DEFAULT 'Cold'::text,
    event_type text DEFAULT 'Wedding'::text,
    is_destination boolean DEFAULT false,
    country text DEFAULT 'India'::text,
    phone_primary text NOT NULL,
    phone_secondary text,
    email text,
    bride_name text,
    bride_phone_primary text,
    bride_phone_secondary text,
    bride_email text,
    bride_instagram text,
    groom_name text,
    groom_phone_primary text,
    groom_phone_secondary text,
    groom_email text,
    groom_instagram text,
    instagram text,
    next_followup_date date,
    client_budget_amount numeric,
    amount_quoted numeric,
    source_name text,
    rejected_reason text,
    potential boolean DEFAULT false NOT NULL,
    important boolean DEFAULT false NOT NULL,
    client_offer_amount numeric,
    discounted_amount numeric,
    coverage_scope text DEFAULT 'Both Sides'::text NOT NULL,
    lead_number integer,
    intake_completed boolean DEFAULT false NOT NULL,
    assigned_user_id integer,
    awaiting_advance_since timestamp without time zone,
    first_contacted_at timestamp without time zone,
    converted_at timestamp without time zone,
    negotiation_since timestamp without time zone,
    entered_awaiting_advance boolean DEFAULT false,
    conversion_count integer DEFAULT 0,
    not_contacted_count integer DEFAULT 0,
    proposal_draft jsonb,
    fb_lead_quality character varying(20) DEFAULT NULL::character varying,
    fb_is_spam boolean DEFAULT false,
    CONSTRAINT leads_coverage_scope_check CHECK ((coverage_scope = ANY (ARRAY['Both Sides'::text, 'Bride Side'::text, 'Groom Side'::text]))),
    CONSTRAINT leads_status_check CHECK ((status = ANY (ARRAY['New'::text, 'Contacted'::text, 'Quoted'::text, 'Follow Up'::text, 'Negotiation'::text, 'Awaiting Advance'::text, 'Converted'::text, 'Lost'::text, 'Rejected'::text])))
);


ALTER TABLE public.leads OWNER TO dushyantsaini;

--
-- Name: leads_id_seq; Type: SEQUENCE; Schema: public; Owner: dushyantsaini
--

CREATE SEQUENCE public.leads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.leads_id_seq OWNER TO dushyantsaini;

--
-- Name: leads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dushyantsaini
--

ALTER SEQUENCE public.leads_id_seq OWNED BY public.leads.id;


--
-- Name: leads_ordered; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.leads_ordered AS
 SELECT id,
    name,
    phone_primary,
    phone_secondary,
    email,
    instagram,
    bride_name,
    bride_phone_primary,
    bride_phone_secondary,
    bride_email,
    bride_instagram,
    groom_name,
    groom_phone_primary,
    groom_phone_secondary,
    groom_email,
    groom_instagram,
    source,
    status,
    previous_status,
    heat,
    event_type,
    is_destination,
    country,
    created_at,
    updated_at
   FROM public.leads;


ALTER VIEW public.leads_ordered OWNER TO postgres;

--
-- Name: lost_reason_defaults; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.lost_reason_defaults (
    terminal_status_code text NOT NULL,
    lost_reason_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.lost_reason_defaults OWNER TO dushyantsaini;

--
-- Name: lost_reasons; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.lost_reasons (
    id integer NOT NULL,
    label text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.lost_reasons OWNER TO dushyantsaini;

--
-- Name: lost_reasons_id_seq; Type: SEQUENCE; Schema: public; Owner: dushyantsaini
--

CREATE SEQUENCE public.lost_reasons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lost_reasons_id_seq OWNER TO dushyantsaini;

--
-- Name: lost_reasons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dushyantsaini
--

ALTER SEQUENCE public.lost_reasons_id_seq OWNED BY public.lost_reasons.id;


--
-- Name: metrics_refresh_log; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.metrics_refresh_log (
    id integer DEFAULT 1 NOT NULL,
    last_run_at timestamp without time zone NOT NULL
);


ALTER TABLE public.metrics_refresh_log OWNER TO dushyantsaini;

--
-- Name: money_sources; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.money_sources (
    id integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT money_sources_type_check CHECK ((type = ANY (ARRAY['GST'::text, 'NON_GST'::text, 'CASH'::text, 'PERSONAL'::text])))
);


ALTER TABLE public.money_sources OWNER TO dushyantsaini;

--
-- Name: money_sources_id_seq; Type: SEQUENCE; Schema: public; Owner: dushyantsaini
--

CREATE SEQUENCE public.money_sources_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.money_sources_id_seq OWNER TO dushyantsaini;

--
-- Name: money_sources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dushyantsaini
--

ALTER SEQUENCE public.money_sources_id_seq OWNED BY public.money_sources.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer,
    role_target character varying(50),
    category character varying(50) NOT NULL,
    type character varying(50) DEFAULT 'INFO'::character varying NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    link_url character varying(255),
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    read_at timestamp with time zone
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: operational_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.operational_roles (
    id integer NOT NULL,
    category text NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.operational_roles OWNER TO postgres;

--
-- Name: operational_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.operational_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.operational_roles_id_seq OWNER TO postgres;

--
-- Name: operational_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.operational_roles_id_seq OWNED BY public.operational_roles.id;


--
-- Name: payment_methods; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.payment_methods (
    id integer NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.payment_methods OWNER TO dushyantsaini;

--
-- Name: payment_methods_id_seq; Type: SEQUENCE; Schema: public; Owner: dushyantsaini
--

CREATE SEQUENCE public.payment_methods_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_methods_id_seq OWNER TO dushyantsaini;

--
-- Name: payment_methods_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dushyantsaini
--

ALTER SEQUENCE public.payment_methods_id_seq OWNED BY public.payment_methods.id;


--
-- Name: payment_structure_steps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_structure_steps (
    id integer NOT NULL,
    payment_structure_id integer NOT NULL,
    label text NOT NULL,
    percentage numeric NOT NULL,
    step_order integer NOT NULL
);


ALTER TABLE public.payment_structure_steps OWNER TO postgres;

--
-- Name: payment_structure_steps_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payment_structure_steps_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_structure_steps_id_seq OWNER TO postgres;

--
-- Name: payment_structure_steps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payment_structure_steps_id_seq OWNED BY public.payment_structure_steps.id;


--
-- Name: payment_structures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_structures (
    id integer NOT NULL,
    name text NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.payment_structures OWNER TO postgres;

--
-- Name: payment_structures_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payment_structures_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.payment_structures_id_seq OWNER TO postgres;

--
-- Name: payment_structures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payment_structures_id_seq OWNED BY public.payment_structures.id;


--
-- Name: photo_library; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.photo_library (
    id integer NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    content_hash text
);


ALTER TABLE public.photo_library OWNER TO postgres;

--
-- Name: photo_library_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.photo_library_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.photo_library_id_seq OWNER TO postgres;

--
-- Name: photo_library_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.photo_library_id_seq OWNED BY public.photo_library.id;


--
-- Name: pricing_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pricing_rules (
    id integer NOT NULL,
    rule_name text NOT NULL,
    conditions_json jsonb NOT NULL,
    default_team_json jsonb NOT NULL,
    default_deliverables_json jsonb NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.pricing_rules OWNER TO postgres;

--
-- Name: pricing_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.pricing_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pricing_rules_id_seq OWNER TO postgres;

--
-- Name: pricing_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.pricing_rules_id_seq OWNED BY public.pricing_rules.id;


--
-- Name: projects; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.projects (
    id integer NOT NULL,
    lead_id integer,
    name text NOT NULL,
    status text DEFAULT 'Pre-Production'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.projects OWNER TO dushyantsaini;

--
-- Name: projects_id_seq; Type: SEQUENCE; Schema: public; Owner: dushyantsaini
--

CREATE SEQUENCE public.projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.projects_id_seq OWNER TO dushyantsaini;

--
-- Name: projects_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dushyantsaini
--

ALTER SEQUENCE public.projects_id_seq OWNED BY public.projects.id;


--
-- Name: proposal_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.proposal_events (
    id integer NOT NULL,
    proposal_snapshot_id integer NOT NULL,
    session_id text NOT NULL,
    event_type text NOT NULL,
    event_data jsonb DEFAULT '{}'::jsonb,
    ip text,
    device text,
    referrer text,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.proposal_events OWNER TO postgres;

--
-- Name: proposal_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.proposal_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.proposal_events_id_seq OWNER TO postgres;

--
-- Name: proposal_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.proposal_events_id_seq OWNED BY public.proposal_events.id;


--
-- Name: proposal_snapshots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.proposal_snapshots (
    id integer NOT NULL,
    quote_version_id integer NOT NULL,
    proposal_token text NOT NULL,
    snapshot_json jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    expires_at timestamp(3) without time zone,
    view_count integer DEFAULT 0 NOT NULL,
    last_viewed_at timestamp(3) without time zone
);


ALTER TABLE public.proposal_snapshots OWNER TO postgres;

--
-- Name: proposal_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.proposal_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.proposal_snapshots_id_seq OWNER TO postgres;

--
-- Name: proposal_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.proposal_snapshots_id_seq OWNED BY public.proposal_snapshots.id;


--
-- Name: proposal_views; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.proposal_views (
    id integer NOT NULL,
    proposal_snapshot_id integer NOT NULL,
    ip text,
    device text,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.proposal_views OWNER TO postgres;

--
-- Name: proposal_views_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.proposal_views_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.proposal_views_id_seq OWNER TO postgres;

--
-- Name: proposal_views_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.proposal_views_id_seq OWNED BY public.proposal_views.id;


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_used_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.push_subscriptions OWNER TO postgres;

--
-- Name: quote_approvals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.quote_approvals (
    id integer NOT NULL,
    quote_version_id integer NOT NULL,
    approved_by integer,
    approved_at timestamp(3) without time zone,
    note text,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.quote_approvals OWNER TO postgres;

--
-- Name: quote_approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.quote_approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.quote_approvals_id_seq OWNER TO postgres;

--
-- Name: quote_approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.quote_approvals_id_seq OWNED BY public.quote_approvals.id;


--
-- Name: quote_groups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.quote_groups (
    id integer NOT NULL,
    lead_id integer NOT NULL,
    title text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.quote_groups OWNER TO postgres;

--
-- Name: quote_groups_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.quote_groups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.quote_groups_id_seq OWNER TO postgres;

--
-- Name: quote_groups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.quote_groups_id_seq OWNED BY public.quote_groups.id;


--
-- Name: quote_negotiations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.quote_negotiations (
    id integer NOT NULL,
    quote_version_id integer NOT NULL,
    type public.negotiation_type NOT NULL,
    message text NOT NULL,
    created_by integer,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.quote_negotiations OWNER TO postgres;

--
-- Name: quote_negotiations_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.quote_negotiations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.quote_negotiations_id_seq OWNER TO postgres;

--
-- Name: quote_negotiations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.quote_negotiations_id_seq OWNED BY public.quote_negotiations.id;


--
-- Name: quote_pricing_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.quote_pricing_items (
    id integer NOT NULL,
    quote_version_id integer NOT NULL,
    item_type public.pricing_item_type NOT NULL,
    catalog_id integer NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric(65,30) NOT NULL,
    total_price numeric(65,30) NOT NULL
);


ALTER TABLE public.quote_pricing_items OWNER TO postgres;

--
-- Name: quote_pricing_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.quote_pricing_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.quote_pricing_items_id_seq OWNER TO postgres;

--
-- Name: quote_pricing_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.quote_pricing_items_id_seq OWNED BY public.quote_pricing_items.id;


--
-- Name: quote_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.quote_versions (
    id integer NOT NULL,
    quote_group_id integer NOT NULL,
    version_number integer NOT NULL,
    status public.quote_status DEFAULT 'DRAFT'::public.quote_status NOT NULL,
    calculated_price numeric(65,30),
    sales_override_price numeric(65,30),
    override_reason text,
    target_price numeric(65,30),
    soft_discount_price numeric(65,30),
    minimum_price numeric(65,30),
    draft_data_json jsonb,
    is_latest boolean DEFAULT true NOT NULL,
    created_by integer,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.quote_versions OWNER TO postgres;

--
-- Name: quote_versions_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.quote_versions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.quote_versions_id_seq OWNER TO postgres;

--
-- Name: quote_versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.quote_versions_id_seq OWNED BY public.quote_versions.id;


--
-- Name: rate_card_types; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.rate_card_types (
    id integer NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT rate_card_types_unit_check CHECK ((unit = ANY (ARRAY['day'::text, 'event'::text, 'project'::text, 'edit'::text])))
);


ALTER TABLE public.rate_card_types OWNER TO dushyantsaini;

--
-- Name: rate_card_types_id_seq; Type: SEQUENCE; Schema: public; Owner: dushyantsaini
--

CREATE SEQUENCE public.rate_card_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.rate_card_types_id_seq OWNER TO dushyantsaini;

--
-- Name: rate_card_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dushyantsaini
--

ALTER SEQUENCE public.rate_card_types_id_seq OWNED BY public.rate_card_types.id;


--
-- Name: ref_budget_buckets; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.ref_budget_buckets (
    value text NOT NULL
);


ALTER TABLE public.ref_budget_buckets OWNER TO dushyantsaini;

--
-- Name: ref_event_types; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.ref_event_types (
    value text NOT NULL
);


ALTER TABLE public.ref_event_types OWNER TO dushyantsaini;

--
-- Name: ref_function_types; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.ref_function_types (
    value text NOT NULL
);


ALTER TABLE public.ref_function_types OWNER TO dushyantsaini;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    key text NOT NULL,
    label text NOT NULL
);


ALTER TABLE public.roles OWNER TO dushyantsaini;

--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: dushyantsaini
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.roles_id_seq OWNER TO dushyantsaini;

--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dushyantsaini
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.schema_migrations OWNER TO dushyantsaini;

--
-- Name: smart_notification_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.smart_notification_log (
    notif_key text NOT NULL,
    sent_date date NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.smart_notification_log OWNER TO postgres;

--
-- Name: system_defaults; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.system_defaults (
    id integer NOT NULL,
    default_followup_mode text NOT NULL,
    default_assignment_rule text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_defaults_default_assignment_rule_check CHECK ((default_assignment_rule = ANY (ARRAY['manual'::text, 'round_robin'::text, 'last_assigned'::text]))),
    CONSTRAINT system_defaults_default_followup_mode_check CHECK ((default_followup_mode = ANY (ARRAY['call'::text, 'whatsapp'::text]))),
    CONSTRAINT system_defaults_id_check CHECK ((id = 1))
);


ALTER TABLE public.system_defaults OWNER TO dushyantsaini;

--
-- Name: team_role_catalog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.team_role_catalog (
    id integer NOT NULL,
    name text NOT NULL,
    price numeric(65,30) NOT NULL,
    unit_type public.unit_type NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    operational_role_id integer
);


ALTER TABLE public.team_role_catalog OWNER TO postgres;

--
-- Name: team_role_catalog_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.team_role_catalog_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.team_role_catalog_id_seq OWNER TO postgres;

--
-- Name: team_role_catalog_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.team_role_catalog_id_seq OWNED BY public.team_role_catalog.id;


--
-- Name: testimonials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.testimonials (
    id integer NOT NULL,
    couple_names text NOT NULL,
    testimonial_text text NOT NULL,
    media_url text,
    media_type text DEFAULT 'photo'::text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.testimonials OWNER TO postgres;

--
-- Name: testimonials_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.testimonials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.testimonials_id_seq OWNER TO postgres;

--
-- Name: testimonials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.testimonials_id_seq OWNED BY public.testimonials.id;


--
-- Name: user_metrics_daily; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.user_metrics_daily (
    user_id integer NOT NULL,
    metric_date date NOT NULL,
    total_sessions integer DEFAULT 0 NOT NULL,
    total_session_duration_seconds integer DEFAULT 0 NOT NULL,
    leads_opened_count integer DEFAULT 0 NOT NULL,
    total_time_spent_on_leads_seconds integer DEFAULT 0 NOT NULL,
    followups_done integer DEFAULT 0 NOT NULL,
    negotiations_done integer DEFAULT 0 NOT NULL,
    quotes_generated integer DEFAULT 0 NOT NULL,
    conversions integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.user_metrics_daily OWNER TO dushyantsaini;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.user_roles (
    user_id integer NOT NULL,
    role_id integer NOT NULL,
    assigned_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_roles OWNER TO dushyantsaini;

--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.user_sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    login_at timestamp without time zone DEFAULT now() NOT NULL,
    logout_at timestamp without time zone,
    duration_seconds integer,
    device_type text,
    user_agent text,
    client_kind text,
    platform text,
    client_name text,
    client_version text,
    last_seen_at timestamp without time zone
);


ALTER TABLE public.user_sessions OWNER TO dushyantsaini;

--
-- Name: user_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: dushyantsaini
--

CREATE SEQUENCE public.user_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_sessions_id_seq OWNER TO dushyantsaini;

--
-- Name: user_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dushyantsaini
--

ALTER SEQUENCE public.user_sessions_id_seq OWNED BY public.user_sessions.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email text,
    password_hash text NOT NULL,
    role text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    name text,
    profile_photo text,
    job_title text,
    nickname text,
    phone text,
    is_active boolean DEFAULT true NOT NULL,
    force_password_reset boolean DEFAULT false NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    crew_type text,
    is_login_enabled boolean DEFAULT true,
    operational_role_id integer,
    signature_image text,
    signature_image_dark text,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'sales'::text])))
);


ALTER TABLE public.users OWNER TO dushyantsaini;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: dushyantsaini
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO dushyantsaini;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: dushyantsaini
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: vendor_bill_attachments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendor_bill_attachments (
    id integer NOT NULL,
    vendor_bill_id integer NOT NULL,
    file_url text NOT NULL,
    uploaded_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.vendor_bill_attachments OWNER TO postgres;

--
-- Name: vendor_bill_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vendor_bill_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendor_bill_attachments_id_seq OWNER TO postgres;

--
-- Name: vendor_bill_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vendor_bill_attachments_id_seq OWNED BY public.vendor_bill_attachments.id;


--
-- Name: vendor_bills; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendor_bills (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    lead_id integer,
    bill_date date,
    bill_amount numeric DEFAULT 0 NOT NULL,
    bill_category text NOT NULL,
    is_billable_to_client boolean DEFAULT false NOT NULL,
    status text DEFAULT 'submitted'::text NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT vendor_bills_bill_category_check CHECK ((bill_category = ANY (ARRAY['editing'::text, 'shooting'::text, 'travel'::text, 'food'::text, 'printing'::text, 'misc'::text]))),
    CONSTRAINT vendor_bills_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'rejected'::text, 'paid'::text])))
);


ALTER TABLE public.vendor_bills OWNER TO postgres;

--
-- Name: vendor_bills_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vendor_bills_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendor_bills_id_seq OWNER TO postgres;

--
-- Name: vendor_bills_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vendor_bills_id_seq OWNED BY public.vendor_bills.id;


--
-- Name: vendor_rate_cards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendor_rate_cards (
    id integer NOT NULL,
    vendor_id integer NOT NULL,
    rate_type text NOT NULL,
    rates jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    effective_from date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT vendor_rate_cards_rate_type_check CHECK ((rate_type = ANY (ARRAY['per_day'::text, 'per_function'::text, 'flat'::text])))
);


ALTER TABLE public.vendor_rate_cards OWNER TO postgres;

--
-- Name: vendor_rate_cards_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vendor_rate_cards_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendor_rate_cards_id_seq OWNER TO postgres;

--
-- Name: vendor_rate_cards_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vendor_rate_cards_id_seq OWNED BY public.vendor_rate_cards.id;


--
-- Name: vendors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vendors (
    id integer NOT NULL,
    name text NOT NULL,
    vendor_type text NOT NULL,
    user_id integer,
    phone text,
    email text,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT vendors_vendor_type_check CHECK ((vendor_type = ANY (ARRAY['freelancer'::text, 'employee'::text, 'service'::text])))
);


ALTER TABLE public.vendors OWNER TO postgres;

--
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.vendors_id_seq OWNER TO postgres;

--
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.vendors_id_seq OWNED BY public.vendors.id;


--
-- Name: video_library; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.video_library (
    id integer NOT NULL,
    file_name text NOT NULL,
    file_url text NOT NULL,
    file_hash text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.video_library OWNER TO postgres;

--
-- Name: video_library_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.video_library_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.video_library_id_seq OWNER TO postgres;

--
-- Name: video_library_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.video_library_id_seq OWNED BY public.video_library.id;


--
-- Name: whatsapp_action_status_messages; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.whatsapp_action_status_messages (
    action_key text NOT NULL,
    lead_status_id integer NOT NULL,
    message_body text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.whatsapp_action_status_messages OWNER TO dushyantsaini;

--
-- Name: whatsapp_action_templates; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.whatsapp_action_templates (
    action_key text NOT NULL,
    label text NOT NULL,
    message_body text DEFAULT ''::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.whatsapp_action_templates OWNER TO dushyantsaini;

--
-- Name: whatsapp_templates; Type: TABLE; Schema: public; Owner: dushyantsaini
--

CREATE TABLE public.whatsapp_templates (
    stage text NOT NULL,
    message text NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.whatsapp_templates OWNER TO dushyantsaini;

--
-- Name: admin_audit_log id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_audit_log ALTER COLUMN id SET DEFAULT nextval('public.admin_audit_log_id_seq'::regclass);


--
-- Name: cities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities ALTER COLUMN id SET DEFAULT nextval('public.cities_id_seq'::regclass);


--
-- Name: deliverable_catalog id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliverable_catalog ALTER COLUMN id SET DEFAULT nextval('public.deliverable_catalog_id_seq'::regclass);


--
-- Name: finance_categories id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_categories ALTER COLUMN id SET DEFAULT nextval('public.finance_categories_id_seq'::regclass);


--
-- Name: finance_transactions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_transactions ALTER COLUMN id SET DEFAULT nextval('public.finance_transactions_id_seq'::regclass);


--
-- Name: indian_states id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indian_states ALTER COLUMN id SET DEFAULT nextval('public.indian_states_id_seq'::regclass);


--
-- Name: invoice_line_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_line_items ALTER COLUMN id SET DEFAULT nextval('public.invoice_line_items_id_seq'::regclass);


--
-- Name: invoice_payment_schedule id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_payment_schedule ALTER COLUMN id SET DEFAULT nextval('public.invoice_payment_schedule_id_seq'::regclass);


--
-- Name: invoice_payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_payments ALTER COLUMN id SET DEFAULT nextval('public.invoice_payments_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: lead_activities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_activities ALTER COLUMN id SET DEFAULT nextval('public.lead_activities_id_seq'::regclass);


--
-- Name: lead_cities id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_cities ALTER COLUMN id SET DEFAULT nextval('public.lead_cities_id_seq'::regclass);


--
-- Name: lead_enrichment_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_enrichment_logs ALTER COLUMN id SET DEFAULT nextval('public.lead_enrichment_logs_id_seq'::regclass);


--
-- Name: lead_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_events ALTER COLUMN id SET DEFAULT nextval('public.lead_events_id_seq'::regclass);


--
-- Name: lead_followups id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_followups ALTER COLUMN id SET DEFAULT nextval('public.lead_followups_id_seq'::regclass);


--
-- Name: lead_lost_reasons id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_lost_reasons ALTER COLUMN id SET DEFAULT nextval('public.lead_lost_reasons_id_seq'::regclass);


--
-- Name: lead_negotiations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_negotiations ALTER COLUMN id SET DEFAULT nextval('public.lead_negotiations_id_seq'::regclass);


--
-- Name: lead_notes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_notes ALTER COLUMN id SET DEFAULT nextval('public.lead_notes_id_seq'::regclass);


--
-- Name: lead_pricing_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_pricing_logs ALTER COLUMN id SET DEFAULT nextval('public.lead_pricing_logs_id_seq'::regclass);


--
-- Name: lead_quotes id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_quotes ALTER COLUMN id SET DEFAULT nextval('public.lead_quotes_id_seq'::regclass);


--
-- Name: lead_usage_logs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_usage_logs ALTER COLUMN id SET DEFAULT nextval('public.lead_usage_logs_id_seq'::regclass);


--
-- Name: leads id; Type: DEFAULT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.leads ALTER COLUMN id SET DEFAULT nextval('public.leads_id_seq'::regclass);


--
-- Name: lost_reasons id; Type: DEFAULT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.lost_reasons ALTER COLUMN id SET DEFAULT nextval('public.lost_reasons_id_seq'::regclass);


--
-- Name: money_sources id; Type: DEFAULT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.money_sources ALTER COLUMN id SET DEFAULT nextval('public.money_sources_id_seq'::regclass);


--
-- Name: operational_roles id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.operational_roles ALTER COLUMN id SET DEFAULT nextval('public.operational_roles_id_seq'::regclass);


--
-- Name: payment_methods id; Type: DEFAULT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.payment_methods ALTER COLUMN id SET DEFAULT nextval('public.payment_methods_id_seq'::regclass);


--
-- Name: payment_structure_steps id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_structure_steps ALTER COLUMN id SET DEFAULT nextval('public.payment_structure_steps_id_seq'::regclass);


--
-- Name: payment_structures id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_structures ALTER COLUMN id SET DEFAULT nextval('public.payment_structures_id_seq'::regclass);


--
-- Name: photo_library id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.photo_library ALTER COLUMN id SET DEFAULT nextval('public.photo_library_id_seq'::regclass);


--
-- Name: pricing_rules id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pricing_rules ALTER COLUMN id SET DEFAULT nextval('public.pricing_rules_id_seq'::regclass);


--
-- Name: projects id; Type: DEFAULT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.projects ALTER COLUMN id SET DEFAULT nextval('public.projects_id_seq'::regclass);


--
-- Name: proposal_events id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proposal_events ALTER COLUMN id SET DEFAULT nextval('public.proposal_events_id_seq'::regclass);


--
-- Name: proposal_snapshots id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proposal_snapshots ALTER COLUMN id SET DEFAULT nextval('public.proposal_snapshots_id_seq'::regclass);


--
-- Name: proposal_views id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proposal_views ALTER COLUMN id SET DEFAULT nextval('public.proposal_views_id_seq'::regclass);


--
-- Name: quote_approvals id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quote_approvals ALTER COLUMN id SET DEFAULT nextval('public.quote_approvals_id_seq'::regclass);


--
-- Name: quote_groups id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quote_groups ALTER COLUMN id SET DEFAULT nextval('public.quote_groups_id_seq'::regclass);


--
-- Name: quote_negotiations id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quote_negotiations ALTER COLUMN id SET DEFAULT nextval('public.quote_negotiations_id_seq'::regclass);


--
-- Name: quote_pricing_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quote_pricing_items ALTER COLUMN id SET DEFAULT nextval('public.quote_pricing_items_id_seq'::regclass);


--
-- Name: quote_versions id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quote_versions ALTER COLUMN id SET DEFAULT nextval('public.quote_versions_id_seq'::regclass);


--
-- Name: rate_card_types id; Type: DEFAULT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.rate_card_types ALTER COLUMN id SET DEFAULT nextval('public.rate_card_types_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: team_role_catalog id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_role_catalog ALTER COLUMN id SET DEFAULT nextval('public.team_role_catalog_id_seq'::regclass);


--
-- Name: testimonials id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.testimonials ALTER COLUMN id SET DEFAULT nextval('public.testimonials_id_seq'::regclass);


--
-- Name: user_sessions id; Type: DEFAULT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.user_sessions ALTER COLUMN id SET DEFAULT nextval('public.user_sessions_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: vendor_bill_attachments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_bill_attachments ALTER COLUMN id SET DEFAULT nextval('public.vendor_bill_attachments_id_seq'::regclass);


--
-- Name: vendor_bills id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_bills ALTER COLUMN id SET DEFAULT nextval('public.vendor_bills_id_seq'::regclass);


--
-- Name: vendor_rate_cards id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_rate_cards ALTER COLUMN id SET DEFAULT nextval('public.vendor_rate_cards_id_seq'::regclass);


--
-- Name: vendors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors ALTER COLUMN id SET DEFAULT nextval('public.vendors_id_seq'::regclass);


--
-- Name: video_library id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_library ALTER COLUMN id SET DEFAULT nextval('public.video_library_id_seq'::regclass);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: deliverable_catalog deliverable_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deliverable_catalog
    ADD CONSTRAINT deliverable_catalog_pkey PRIMARY KEY (id);


--
-- Name: finance_categories finance_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_pkey PRIMARY KEY (id);


--
-- Name: finance_transactions finance_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_pkey PRIMARY KEY (id);


--
-- Name: indian_states indian_states_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indian_states
    ADD CONSTRAINT indian_states_name_key UNIQUE (name);


--
-- Name: indian_states indian_states_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.indian_states
    ADD CONSTRAINT indian_states_pkey PRIMARY KEY (id);


--
-- Name: invoice_line_items invoice_line_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id);


--
-- Name: invoice_payment_schedule invoice_payment_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_payment_schedule
    ADD CONSTRAINT invoice_payment_schedule_pkey PRIMARY KEY (id);


--
-- Name: invoice_payments invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: known_internal_ips known_internal_ips_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.known_internal_ips
    ADD CONSTRAINT known_internal_ips_pkey PRIMARY KEY (ip);


--
-- Name: lead_activities lead_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_pkey PRIMARY KEY (id);


--
-- Name: lead_cities lead_cities_lead_id_city_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_cities
    ADD CONSTRAINT lead_cities_lead_id_city_id_key UNIQUE (lead_id, city_id);


--
-- Name: lead_cities lead_cities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_cities
    ADD CONSTRAINT lead_cities_pkey PRIMARY KEY (id);


--
-- Name: lead_enrichment_logs lead_enrichment_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_enrichment_logs
    ADD CONSTRAINT lead_enrichment_logs_pkey PRIMARY KEY (id);


--
-- Name: lead_events lead_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_events
    ADD CONSTRAINT lead_events_pkey PRIMARY KEY (id);


--
-- Name: lead_followups lead_followups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_followups
    ADD CONSTRAINT lead_followups_pkey PRIMARY KEY (id);


--
-- Name: lead_lost_reasons lead_lost_reasons_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_lost_reasons
    ADD CONSTRAINT lead_lost_reasons_lead_id_key UNIQUE (lead_id);


--
-- Name: lead_lost_reasons lead_lost_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_lost_reasons
    ADD CONSTRAINT lead_lost_reasons_pkey PRIMARY KEY (id);


--
-- Name: lead_metrics lead_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_metrics
    ADD CONSTRAINT lead_metrics_pkey PRIMARY KEY (lead_id);


--
-- Name: lead_negotiations lead_negotiations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_negotiations
    ADD CONSTRAINT lead_negotiations_pkey PRIMARY KEY (id);


--
-- Name: lead_notes lead_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_pkey PRIMARY KEY (id);


--
-- Name: lead_pricing_logs lead_pricing_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_pricing_logs
    ADD CONSTRAINT lead_pricing_logs_pkey PRIMARY KEY (id);


--
-- Name: lead_quotes lead_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_quotes
    ADD CONSTRAINT lead_quotes_pkey PRIMARY KEY (id);


--
-- Name: lead_usage_logs lead_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_usage_logs
    ADD CONSTRAINT lead_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: lost_reason_defaults lost_reason_defaults_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.lost_reason_defaults
    ADD CONSTRAINT lost_reason_defaults_pkey PRIMARY KEY (terminal_status_code);


--
-- Name: lost_reasons lost_reasons_label_key; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.lost_reasons
    ADD CONSTRAINT lost_reasons_label_key UNIQUE (label);


--
-- Name: lost_reasons lost_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.lost_reasons
    ADD CONSTRAINT lost_reasons_pkey PRIMARY KEY (id);


--
-- Name: metrics_refresh_log metrics_refresh_log_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.metrics_refresh_log
    ADD CONSTRAINT metrics_refresh_log_pkey PRIMARY KEY (id);


--
-- Name: money_sources money_sources_name_key; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.money_sources
    ADD CONSTRAINT money_sources_name_key UNIQUE (name);


--
-- Name: money_sources money_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.money_sources
    ADD CONSTRAINT money_sources_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: operational_roles operational_roles_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.operational_roles
    ADD CONSTRAINT operational_roles_name_key UNIQUE (name);


--
-- Name: operational_roles operational_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.operational_roles
    ADD CONSTRAINT operational_roles_pkey PRIMARY KEY (id);


--
-- Name: payment_methods payment_methods_name_key; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_name_key UNIQUE (name);


--
-- Name: payment_methods payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.payment_methods
    ADD CONSTRAINT payment_methods_pkey PRIMARY KEY (id);


--
-- Name: payment_structure_steps payment_structure_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_structure_steps
    ADD CONSTRAINT payment_structure_steps_pkey PRIMARY KEY (id);


--
-- Name: payment_structures payment_structures_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_structures
    ADD CONSTRAINT payment_structures_pkey PRIMARY KEY (id);


--
-- Name: photo_library photo_library_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.photo_library
    ADD CONSTRAINT photo_library_pkey PRIMARY KEY (id);


--
-- Name: pricing_rules pricing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);


--
-- Name: projects projects_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_lead_id_key UNIQUE (lead_id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: proposal_events proposal_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proposal_events
    ADD CONSTRAINT proposal_events_pkey PRIMARY KEY (id);


--
-- Name: proposal_snapshots proposal_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proposal_snapshots
    ADD CONSTRAINT proposal_snapshots_pkey PRIMARY KEY (id);


--
-- Name: proposal_snapshots proposal_snapshots_proposal_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proposal_snapshots
    ADD CONSTRAINT proposal_snapshots_proposal_token_key UNIQUE (proposal_token);


--
-- Name: proposal_views proposal_views_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.proposal_views
    ADD CONSTRAINT proposal_views_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_user_id_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_endpoint_key UNIQUE (user_id, endpoint);


--
-- Name: quote_approvals quote_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quote_approvals
    ADD CONSTRAINT quote_approvals_pkey PRIMARY KEY (id);


--
-- Name: quote_groups quote_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quote_groups
    ADD CONSTRAINT quote_groups_pkey PRIMARY KEY (id);


--
-- Name: quote_negotiations quote_negotiations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quote_negotiations
    ADD CONSTRAINT quote_negotiations_pkey PRIMARY KEY (id);


--
-- Name: quote_pricing_items quote_pricing_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quote_pricing_items
    ADD CONSTRAINT quote_pricing_items_pkey PRIMARY KEY (id);


--
-- Name: quote_versions quote_versions_group_version_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quote_versions
    ADD CONSTRAINT quote_versions_group_version_unique UNIQUE (quote_group_id, version_number);


--
-- Name: quote_versions quote_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.quote_versions
    ADD CONSTRAINT quote_versions_pkey PRIMARY KEY (id);


--
-- Name: rate_card_types rate_card_types_name_key; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.rate_card_types
    ADD CONSTRAINT rate_card_types_name_key UNIQUE (name);


--
-- Name: rate_card_types rate_card_types_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.rate_card_types
    ADD CONSTRAINT rate_card_types_pkey PRIMARY KEY (id);


--
-- Name: ref_budget_buckets ref_budget_buckets_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.ref_budget_buckets
    ADD CONSTRAINT ref_budget_buckets_pkey PRIMARY KEY (value);


--
-- Name: ref_event_types ref_event_types_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.ref_event_types
    ADD CONSTRAINT ref_event_types_pkey PRIMARY KEY (value);


--
-- Name: ref_function_types ref_function_types_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.ref_function_types
    ADD CONSTRAINT ref_function_types_pkey PRIMARY KEY (value);


--
-- Name: roles roles_key_key; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_key_key UNIQUE (key);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: smart_notification_log smart_notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.smart_notification_log
    ADD CONSTRAINT smart_notification_log_pkey PRIMARY KEY (notif_key, sent_date);


--
-- Name: system_defaults system_defaults_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.system_defaults
    ADD CONSTRAINT system_defaults_pkey PRIMARY KEY (id);


--
-- Name: team_role_catalog team_role_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.team_role_catalog
    ADD CONSTRAINT team_role_catalog_pkey PRIMARY KEY (id);


--
-- Name: testimonials testimonials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.testimonials
    ADD CONSTRAINT testimonials_pkey PRIMARY KEY (id);


--
-- Name: user_metrics_daily user_metrics_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.user_metrics_daily
    ADD CONSTRAINT user_metrics_daily_pkey PRIMARY KEY (user_id, metric_date);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: vendor_bill_attachments vendor_bill_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_bill_attachments
    ADD CONSTRAINT vendor_bill_attachments_pkey PRIMARY KEY (id);


--
-- Name: vendor_bills vendor_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_bills
    ADD CONSTRAINT vendor_bills_pkey PRIMARY KEY (id);


--
-- Name: vendor_rate_cards vendor_rate_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendor_rate_cards
    ADD CONSTRAINT vendor_rate_cards_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: video_library video_library_file_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_library
    ADD CONSTRAINT video_library_file_hash_key UNIQUE (file_hash);


--
-- Name: video_library video_library_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_library
    ADD CONSTRAINT video_library_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_action_status_messages whatsapp_action_status_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.whatsapp_action_status_messages
    ADD CONSTRAINT whatsapp_action_status_messages_pkey PRIMARY KEY (action_key, lead_status_id);


--
-- Name: whatsapp_action_templates whatsapp_action_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.whatsapp_action_templates
    ADD CONSTRAINT whatsapp_action_templates_pkey PRIMARY KEY (action_key);


--
-- Name: whatsapp_templates whatsapp_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: dushyantsaini
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (stage);


--
-- Name: finance_transactions_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX finance_transactions_date_idx ON public.finance_transactions USING btree (date);


--
-- Name: idx_admin_audit_log_ip; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_admin_audit_log_ip ON public.admin_audit_log USING btree (ip);


--
-- Name: idx_finance_transactions_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_finance_transactions_date ON public.finance_transactions USING btree (date);


--
-- Name: idx_lead_activities_lead_id_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_activities_lead_id_created_at ON public.lead_activities USING btree (lead_id, created_at);


--
-- Name: idx_lead_activities_type_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_activities_type_created_at ON public.lead_activities USING btree (activity_type, created_at);


--
-- Name: idx_lead_cities_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_cities_lead_id ON public.lead_cities USING btree (lead_id);


--
-- Name: idx_lead_enrichment_logs_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_enrichment_logs_lead_id ON public.lead_enrichment_logs USING btree (lead_id);


--
-- Name: idx_lead_events_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_events_lead_id ON public.lead_events USING btree (lead_id);


--
-- Name: idx_lead_followups_lead_id_follow_up_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_followups_lead_id_follow_up_at ON public.lead_followups USING btree (lead_id, follow_up_at);


--
-- Name: idx_lead_negotiations_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_negotiations_lead_id ON public.lead_negotiations USING btree (lead_id);


--
-- Name: idx_lead_notes_lead_id_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_notes_lead_id_created_at ON public.lead_notes USING btree (lead_id, created_at);


--
-- Name: idx_lead_pricing_logs_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_pricing_logs_lead_id ON public.lead_pricing_logs USING btree (lead_id);


--
-- Name: idx_lead_quotes_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_quotes_lead_id ON public.lead_quotes USING btree (lead_id);


--
-- Name: idx_lead_usage_logs_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_usage_logs_lead_id ON public.lead_usage_logs USING btree (lead_id);


--
-- Name: idx_lead_usage_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lead_usage_logs_user_id ON public.lead_usage_logs USING btree (user_id);


--
-- Name: idx_leads_assigned_user_id; Type: INDEX; Schema: public; Owner: dushyantsaini
--

CREATE INDEX idx_leads_assigned_user_id ON public.leads USING btree (assigned_user_id);


--
-- Name: idx_leads_bride_phone_primary; Type: INDEX; Schema: public; Owner: dushyantsaini
--

CREATE INDEX idx_leads_bride_phone_primary ON public.leads USING btree (bride_phone_primary);


--
-- Name: idx_leads_fb_quality; Type: INDEX; Schema: public; Owner: dushyantsaini
--

CREATE INDEX idx_leads_fb_quality ON public.leads USING btree (fb_lead_quality) WHERE (fb_lead_quality IS NOT NULL);


--
-- Name: idx_leads_fb_spam; Type: INDEX; Schema: public; Owner: dushyantsaini
--

CREATE INDEX idx_leads_fb_spam ON public.leads USING btree (fb_is_spam) WHERE (fb_is_spam = true);


--
-- Name: idx_leads_groom_phone_primary; Type: INDEX; Schema: public; Owner: dushyantsaini
--

CREATE INDEX idx_leads_groom_phone_primary ON public.leads USING btree (groom_phone_primary);


--
-- Name: idx_leads_phone_primary; Type: INDEX; Schema: public; Owner: dushyantsaini
--

CREATE INDEX idx_leads_phone_primary ON public.leads USING btree (phone_primary);


--
-- Name: idx_leads_source_fb; Type: INDEX; Schema: public; Owner: dushyantsaini
--

CREATE INDEX idx_leads_source_fb ON public.leads USING btree (source) WHERE (source = 'FB Ads'::text);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_role_target; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_role_target ON public.notifications USING btree (role_target);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_proposal_events_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_proposal_events_session ON public.proposal_events USING btree (session_id);


--
-- Name: idx_proposal_events_snapshot; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_proposal_events_snapshot ON public.proposal_events USING btree (proposal_snapshot_id);


--
-- Name: idx_push_subscriptions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_push_subscriptions_user_id ON public.push_subscriptions USING btree (user_id);


--
-- Name: idx_smart_notif_log_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_smart_notif_log_date ON public.smart_notification_log USING btree (sent_date);


--
-- Name: idx_user_metrics_daily_date; Type: INDEX; Schema: public; Owner: dushyantsaini
--

CREATE INDEX idx_user_metrics_daily_date ON public.user_metrics_daily USING btree (metric_date);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: public; Owner: dushyantsaini
--

CREATE INDEX idx_user_sessions_user_id ON public.user_sessions USING btree (user_id);


--
-- Name: leads_lead_number_key; Type: INDEX; Schema: public; Owner: dushyantsaini
--

CREATE UNIQUE INDEX leads_lead_number_key ON public.leads USING btree (lead_number);


--
-- Name: payment_structures_default_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX payment_structures_default_idx ON public.payment_structures USING btree (is_default) WHERE (is_default = true);


--
-- Name: photo_library_content_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX photo_library_content_hash_idx ON public.photo_library USING btree (content_hash);


--
-- Name: photo_library_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX photo_library_created_at_idx ON public.photo_library USING btree (created_at DESC);


--
-- Name: photo_library_tags_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX photo_library_tags_idx ON public.photo_library USING gin (tags);


--
-- Name: proposal_snapshots_version_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX proposal_snapshots_version_idx ON public.proposal_snapshots USING btree (quote_version_id);


--
-- Name: proposal_views_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX proposal_views_created_idx ON public.proposal_views USING btree (created_at);


--
-- Name: proposal_views_snapshot_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX proposal_views_snapshot_idx ON public.proposal_views USING btree (proposal_snapshot_id);


--
-- Name: quote_approvals_version_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX quote_approvals_version_idx ON public.quote_approvals USING btree (quote_version_id);


--
-- Name: quote_negotiations_version_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX quote_negotiations_version_idx ON public.quote_negotiations USING btree (quote_version_id);


--
-- Name: quote_pricing_items_version_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX quote_pricing_items_version_idx ON public.quote_pricing_items USING btree (quote_version_id);


--
-- Name: quote_versions_group_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX quote_versions_group_idx ON public.quote_versions USING btree (quote_group_id);


--
-- Name: quote_versions_latest_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX quote_versions_latest_unique ON public.quote_versions USING btree (quote_group_id) WHERE (is_latest = true);


--
-- Name: quote_versions_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX quote_versions_status_idx ON public.quote_versions USING btree (status);


--
-- Name: testimonials_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX testimonials_created_at_idx ON public.testimonials USING btree (created_at DESC);


--
-- Name: users_phone_unique_not_null; Type: INDEX; Schema: public; Owner: dushyantsaini
--

CREATE UNIQUE INDEX users_phone_unique_not_null ON public.users USING btree (phone) WHERE (phone IS NOT NULL);


--
-- Name: vendor_bills_lead_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vendor_bills_lead_id_idx ON public.vendor_bills USING btree (lead_id);


--
-- Name: vendor_bills_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vendor_bills_status_idx ON public.vendor_bills USING btree (status);


--
-- Name: vendor_bills_vendor_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vendor_bills_vendor_id_idx ON public.vendor_bills USING btree (vendor_id);


--
-- Name: vendor_rate_cards_active_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX vendor_rate_cards_active_unique ON public.vendor_rate_cards USING btree (vendor_id) WHERE (is_active = true);


--
-- Name: vendor_rate_cards_vendor_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vendor_rate_cards_vendor_id_idx ON public.vendor_rate_cards USING btree (vendor_id);


--
-- Name: video_library_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX video_library_created_at_idx ON public.video_library USING btree (created_at DESC);


--
-- Name: video_library_tags_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX video_library_tags_idx ON public.video_library USING gin (tags);


--
-- Name: vendor_rate_cards vendor_rate_cards_vendor_type_check; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER vendor_rate_cards_vendor_type_check BEFORE INSERT OR UPDATE OF vendor_id ON public.vendor_rate_cards FOR EACH ROW EXECUTE FUNCTION public.enforce_freelancer_vendor_rate_card();


--
-- Name: finance_transactions finance_transactions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.finance_categories(id);


--
-- Name: invoice_line_items invoice_line_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_payment_schedule invoice_payment_schedule_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_payment_schedule
    ADD CONSTRAINT invoice_payment_schedule_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoice_payments invoice_payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: lead_activities lead_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_activities lead_activities_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_activities
    ADD CONSTRAINT lead_activities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: lead_cities lead_cities_city_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_cities
    ADD CONSTRAINT lead_cities_city_id_fkey FOREIGN KEY (city_id) REFERENCES public.cities(id);


--
-- Name: lead_cities lead_cities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_cities
    ADD CONSTRAINT lead_cities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_enrichment_logs lead_enrichment_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_enrichment_logs
    ADD CONSTRAINT lead_enrichment_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_enrichment_logs lead_enrichment_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_enrichment_logs
    ADD CONSTRAINT lead_enrichment_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: lead_events lead_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_events
    ADD CONSTRAINT lead_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_followups lead_followups_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_followups
    ADD CONSTRAINT lead_followups_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_followups lead_followups_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_followups
    ADD CONSTRAINT lead_followups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: lead_lost_reasons lead_lost_reasons_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_lost_reasons
    ADD CONSTRAINT lead_lost_reasons_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_metrics lead_metrics_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_metrics
    ADD CONSTRAINT lead_metrics_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_negotiations lead_negotiations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_negotiations
    ADD CONSTRAINT lead_negotiations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_negotiations lead_negotiations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_negotiations
    ADD CONSTRAINT lead_negotiations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: lead_notes lead_notes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_notes lead_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_notes
    ADD CONSTRAINT lead_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: lead_pricing_logs lead_pricing_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_pricing_logs
    ADD CONSTRAINT lead_pricing_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_pricing_logs lead_pricing_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_pricing_logs
    ADD CONSTRAINT lead_pricing_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: lead_quotes lead_quotes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_quotes
    ADD CONSTRAINT lead_quotes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: lead_quotes lead_quotes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_quotes
    ADD CONSTRAINT lead_quotes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_usage_logs lead_usage_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_usage_logs
    ADD CONSTRAINT lead_usage_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_usage_logs lead_usage_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lead_usage_logs
    ADD CONSTRAINT lead_usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- PostgreSQL database dump complete
--

\unrestrict uIIjYEAKKTINXuoL3lcwEIwErBAyJSe5pfj2J2eFqhSlD7mtMNUVLwkHIKdWfzw

