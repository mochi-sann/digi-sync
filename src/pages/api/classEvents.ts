import dayjs from "dayjs";
import { XMLParser } from "fast-xml-parser";
import { JSDOM } from "jsdom";

import ImportRange from "../../types/importRange";
import { ClassEvent, RawClassEvent } from "../../types/types";

import type { NextApiRequest, NextApiResponse } from "next";
import "dayjs/locale/ja";

const jsdom = new JSDOM();
const html_parser = new jsdom.window.DOMParser();
const xml_parser = new XMLParser();

class SessionData {
	j_session_id: string;
	rx_login_key: string;
	rx_token: string;
	javax_faces_view_state: string;
	constructor() {
		this.j_session_id = "";
		this.rx_login_key = "";
		this.rx_token = "";
		this.javax_faces_view_state = "";
	}
}

const LOGIN_URL = "https://portal.dhw.ac.jp/uprx/up/pk/pky001/Pky00101.xhtml";
const API_URL = "https://portal.dhw.ac.jp/uprx/up/bs/bsa001/Bsa00101.xhtml";

type QueryParams = {
	importRange: ImportRange;
	importYear: number;
	password: string;
	username: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

	const queryParameters = urlToQueryParameter(res, req);
	if (queryParameters === undefined) return;
	const { username, password, importYear, importRange } = queryParameters;

	// eslint-disable-next-line prefer-const
	const import_month_list = importRange.getMonthList();

	console.log("username", username);
	console.log("password", "*".repeat(password.length));
	console.log("year", importYear);
	console.log("range", importRange);

	const session_data = await getSessionData(username, password);
	const class_events: ClassEvent[] = [];
	for (const month of import_month_list) {
		try {
			class_events.push(...(await fetchClassEventsOneMonth(month, session_data)));
		} catch (e: unknown) {
			console.log(e);
			if (e instanceof Error) return res.status(500).json({ error: e.message });
			else return res.status(500).json({ error: "Unknown error" });
		}
	}
	return res.status(200).json(class_events);
}

async function fetchClassEventsOneMonth(
	month: number,
	session_data: SessionData,
): Promise<ClassEvent[]> {
	if (month < 1 || month > 12) throw Error("Invalid month");
	const this_year = dayjs().year();
	const dhuPortalRes = await fetch(API_URL, {
		body: generateBody(this_year, month, session_data),
		headers: generateHeaders(session_data.j_session_id),
		method: "POST",
	});

	if (!dhuPortalRes.ok) throw Error("Failed to fetch class events from DHU Portal.");

	let class_events: ClassEvent[];
	try {
		class_events = (await parseClassEvents(dhuPortalRes)).events;
	} catch (e) {
		console.log(e);

		throw Error("Failed to parse class events from DHU Portal. Maybe your login is failing.");
	}
	console.log(month, class_events.length);
	return class_events;
}

function urlToQueryParameter(res: NextApiResponse, req: NextApiRequest): QueryParams | undefined {
	const { username, password, importRange, importYear } = req.query;

	if (
		typeof username !== "string" ||
		typeof password !== "string" ||
		typeof importRange !== "string" ||
		typeof importYear !== "string"
	) {
		res.status(400).json({
			error: `Not enough parameters. Your request is missing ${
				!username ? "'username' " : ""
			}${!password ? "'password' " : ""}${!importRange ? "'importRange' " : ""}${
				!importYear ? "'importYear' " : ""
			}.`,
		});
		return;
	}

	if (isNaN(Number(importYear))) res.status(400).json({ error: "ImportYear must be numeric." });

	try {
		new ImportRange(importRange);
	} catch (e) {
		res.status(400).json({ error: `Invalid importRange '${importRange}'` });
	}
	return {
		importRange: new ImportRange(importRange),
		importYear: Number(importYear),
		password,
		username,
	};
}

async function parseClassEvents(res: Response): Promise<{ events: ClassEvent[] }> {
	const xml_response_body = xml_parser.parse(await res.text());

	const json_class_events = xml_response_body["partial-response"]["changes"]["update"].filter(
		(x: string) => x.includes("events"),
	)[0];

	let non_typed_class_events: RawClassEvent[];
	try {
		non_typed_class_events = JSON.parse(json_class_events).events;
	} catch (e) {
		throw new Error("Failed to parse json_class_events");
	}

	const class_events: ClassEvent[] = [];
	for (const ev of non_typed_class_events) class_events.push(new ClassEvent(ev));
	return { events: class_events };
}

function generateHeaders(j_session_id: string): Record<string, string> {
	return {
		Accept: "application/xml, text/xml, */*; q=0.01",
		"Accept-Encoding": "gzip, deflate, br",
		"Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
		"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
		Cookie: generateCookie({
			j_session_id,
		}),
		"Faces-Request": "partial/ajax",
		Origin: "https://portal.dhw.ac.jp",
		Referer: "https://portal.dhw.ac.jp/uprx/up/pk/pky001/Pky00101.xhtml",
		"Sec-Ch-Ua": 'Not.A/Brand";v="8", "Chromium";v="114", "Google Chrome";v="114',
		"Sec-Ch-Ua-Mobile": "0",
		"Sec-Ch-Ua-Platform": "Windows",
		"Sec-Fetch-Dest": "empty",
		"Sec-Fetch-Mode": "cors",
		"Sec-Fetch-Site": "same-origin",
		"User-Agent":
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
		"X-Requested-With": "XMLHttpRequest",
	};
}

function generateBody(year: number, month: number, sessionData: SessionData): string {
	const data = new URLSearchParams();
	data.append("javax.faces.partial.ajax", "true");
	data.append("javax.faces.source", "funcForm:j_idt361:content");
	data.append("javax.faces.partial.execute", "funcForm:j_idt361:content");
	data.append("javax.faces.partial.render", "funcForm:j_idt361:content");
	data.append("funcForm:j_idt361:content", "funcForm:j_idt361:content");
	data.append(
		"funcForm:j_idt361:content_start",
		(dayjs(`${year}-${month}-1`).unix() * 1000).toString(),
	);
	data.append(
		"funcForm:j_idt361:content_end",
		(dayjs(`${year}-${month}-1`).add(1, "month").add(-1, "day").unix() * 1000).toString(),
	);
	data.append("funcForm", "funcForm");
	data.append("rx-token", sessionData.rx_token);
	data.append("rx-loginKey", sessionData.rx_login_key);
	data.append("rx-deviceKbn", "1");
	data.append("rx-loginType", "Gakuen");
	data.append("funcForm:j_idt162_activeIndex", "0");
	data.append("funcForm:j_idt361:j_idt1767:j_idt1767_input", dayjs().format("YYYY/MM/DD"));
	data.append("funcForm:j_idt361:content_view", "month");
	data.append("funcForm:j_idt361:j_idt2402:0:jugyoMemo", "");
	data.append("funcForm:j_idt361:j_idt2402:1:jugyoMemo", "");
	data.append("funcForm:j_idt361:j_idt2402:2:jugyoMemo", "");
	data.append("funcForm:j_idt361:j_idt2402:3:jugyoMemo", "");
	data.append("funcForm:j_idt361:j_idt2402:4:jugyoMemo", "");
	data.append("funcForm:j_idt361:j_idt2402:5:jugyoMemo", "");
	data.append("funcForm:j_idt361:j_idt2402:6:jugyoMemo", "");
	data.append("funcForm:j_idt361:j_idt2402:7:jugyoMemo", "");
	data.append("funcForm:j_idt361:j_idt2402:8:jugyoMemo", "");
	data.append("funcForm:j_idt361_activeIndex", "1");
	data.append("javax.faces.ViewState", sessionData.javax_faces_view_state);
	return data.toString();
}

function generateCookie(param: { j_session_id: string }): string {
	return `HttpOnly; JSESSIONID = ${param.j_session_id}; _ga = GA1.1.1861578561.1676779041; _ga_CNQG4KE1EB = GS1.1.1676779040.1.1.1676779053.47.0.0`;
}

// for debug
// function formatBody(body: string): string {
//     return body.replace(/[a-zA-Z0-9<>=":_/()?.;,%'&{}$#\- \n]/g, '')
// }

async function getSessionData(username: string, password: string): Promise<SessionData> {
	const session_data = new SessionData();
	const res = await getLoginResponse(username, password);
	if (res.status != 200) throw new Error("Login failed");
	const document_after_login = html_parser.parseFromString(await res.text(), "text/html");

	session_data.j_session_id = extractJSessionId(res.headers.get("set-cookie"));
	for (const input of document_after_login.querySelectorAll("input")) {
		if (input.name == "rx-token") session_data.rx_token = input.value;
		if (input.name == "rx-loginKey") session_data.rx_login_key = input.value;
		if (input.name == "javax.faces.ViewState")
			session_data.javax_faces_view_state = input.value;
	}

	return session_data;
}

async function getLoginResponse(username: string, password: string): Promise<Response> {
	const res = await fetch(LOGIN_URL, {
		body: generateLoginBody(username, password),
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		method: "POST",
	});
	return res;
}

function generateLoginBody(username: string, password: string): string {
	const data = new URLSearchParams();
	data.append("loginForm", "loginForm");
	data.append("loginForm:userId", username);
	data.append("loginForm:password", password);
	data.append("loginForm:loginButton", "");
	data.append("javax.faces.ViewState", "stateless");
	return data.toString();
}

function extractJSessionId(cookie: string | null): string {
	if (cookie === null) return "";
	const regex = /JSESSIONID=([^;]+)/;
	const match = cookie.match(regex);
	if (match) {
		const jsessionid = match[1];
		return jsessionid;
	}
	return "";
}
