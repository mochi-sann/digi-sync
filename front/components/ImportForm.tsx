import ImportRange from "./import_module/ImportRange";
import DHUPortalData from "./import_module/DHUPortalData";
import ImportOptions from "./import_module/ImportOptions";
import ToCalendar from "./import_module/ToCalendar";
import {Button, Stack, SelectChangeEvent, Select, InputLabel, FormControl, MenuItem} from "@mui/material";
import {useState, useEffect, ChangeEvent, ReactNode} from "react";
import {useSession, Session} from "next-auth/react";
import type {CalendarList, Event} from "../gapi_calendar.d.ts";
import {encodeQueryData, getEndTime, getQuarterRange} from "./utils";
import {Inputs, ClassEvent} from "./types";

const FORM_STATE_INIT_VALUE: Inputs = {
    importYear: (new Date().getFullYear() - 1).toString(),
    importRange: "",
    toCalendar: "",
    username: "",
    password: "",
    ignoreOtherEvents: true,
} as Inputs;

const INIT_REQUIRE_VALUE_LIST = ["importRange", "toCalendar", "username", "password"];

export default function ImportForm() {
    let [formState, setFormState] = useState<Inputs>(FORM_STATE_INIT_VALUE);
    let [accessToken, setAccessToken] = useState<string>("");
    let [importCount, setImportCount] = useState<number>(0);
    let [totalImportCount, setTotalImportCount] = useState<number>(0);

    let [importRangeError, setImportRangeError] = useState<string>("");
    let [calendarInputError, setCalendarInputError] = useState<string>("");
    let [dhuPortalInputError, setDhuPortalInputError] = useState({username: "", password: ""});

    let [appState, setAppState] = useState<"unauthenticated" | "ready" | "connect portal" | "import">("unauthenticated");

    let selectableYears: Array<number> = new Array<number>(new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1);
    const {data: session, status: authStatus} = useSession();

    useEffect(() => {
        if (authStatus == "unauthenticated") setAppState("unauthenticated");
        else setAppState("ready");
    }, [authStatus]);

    useEffect(() => {
        if (appState == "import") {
            window.onbeforeunload = function () {
                return "Are you sure you want to leave this page?";
            };
        } else {
            window.onbeforeunload = null;
        }

        return () => {
            window.onbeforeunload = null;
        };
    }, [appState]);

    const handleSelectChange = (event: SelectChangeEvent<string>, child: ReactNode) => {
        const value = event.target.value;
        setFormState({
            ...formState,
            [event.target.name]: value,
        });
    };

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setFormState({
            ...formState,
            [event.target.name]: value,
        });
    };

    const onImportClick = async () => {
        resetErrorMessage();
        if (existsStateEmpty()) {
            setErrorMessages();
            return;
        }

        let data;
        try {
            data = await getEventList();
        } catch (e: any) {
            alert(e.message);
            setAppState("ready");
            return;
        }
        setAppState("import");
        let class_events: Array<ClassEvent> = data.events;
        if (formState.ignoreOtherEvents) {
            class_events = data.events.filter((e: ClassEvent) => e.className.indexOf("eventJugyo") !== -1);
        }
        setImportCount(0);
        class_events = excludeOutOfImportRange(class_events);
        await postToGoogleCalendar(class_events);
        setAppState("ready");
    };

    function existsStateEmpty() {
        for (let input_label of Object.keys(formState)) {
            if (INIT_REQUIRE_VALUE_LIST.includes(input_label) && FORM_STATE_INIT_VALUE[input_label] == formState[input_label]) return true;
        }
        return false;
    }

    const getEventList = async () => {
        setAppState("connect portal");
        let res;
        let query_param_obj = {
            importYear: formState.importYear,
            importRange: formState.importRange,
            username: formState.username,
            password: formState.password,
        };
        let query_param_str = new URLSearchParams(query_param_obj).toString();
        try {
            res = await fetch(process.env.NEXT_PUBLIC_API_DOMAIN + "/get_dhu_event_list?" + query_param_str, {method: "GET"});
            res = await res.json();
        } catch {
            throw new Error("サーバーに接続できませんでした");
        }
        if (res.status_code == "401" && res.detail == "user id or password is invalid") throw new Error("ユーザー名またはパスワードが違います");
        return res;
    };

    function resetErrorMessage() {
        setImportRangeError(FORM_STATE_INIT_VALUE.importRange);
        setCalendarInputError(FORM_STATE_INIT_VALUE.toCalendar);
        setDhuPortalInputError({username: FORM_STATE_INIT_VALUE.username, password: FORM_STATE_INIT_VALUE.password});
    }

    function setErrorMessages() {
        if (formState.importRange == FORM_STATE_INIT_VALUE.importRange) {
            setImportRangeError("インポート範囲が指定されていません");
        }
        if (formState.toCalendar == FORM_STATE_INIT_VALUE.toCalendar) {
            setCalendarInputError("インポート先のカレンダーが指定されていません");
        }
        let username_error_msg = "";
        if (formState.username == FORM_STATE_INIT_VALUE.username) {
            username_error_msg = "ユーザー名を入力してください";
        }
        let password_error_msg = "";
        if (formState.password == FORM_STATE_INIT_VALUE.password) {
            password_error_msg = "パスワードを入力してください";
        }
        setDhuPortalInputError({username: username_error_msg, password: password_error_msg});
    }

    function excludeOutOfImportRange(class_events: ClassEvent[]): ClassEvent[] {
        let {start: start_date, end: end_date} = getQuarterRange(parseInt(formState.importYear), formState.importRange);
        let start = start_date.getTime();
        let end = end_date.getTime();
        return class_events.filter((class_event) => {
            let start_date = new Date(class_event.start).getTime();
            return start_date > start && start_date < end;
        });
    }

    // class_eventsをgoogleに追加する
    const postToGoogleCalendar = async (class_events: Array<ClassEvent>) => {
        if (session instanceof Session) return;
        let already_posted_event_list: Array<Event>;
        try {
            already_posted_event_list = await getAlreadyPostedEvents(session);
            class_events = class_events.filter((class_event) => !isEventDuplicated(already_posted_event_list, class_event));
        } catch (e) {
            console.error("Failed to retrieve from import destination google calendar");
        }
        setTotalImportCount(class_events.length);
        for (const class_event of class_events) {
            try {
                await addEventToGoogleCal(class_event.start, class_event.title);
            } catch (error) {
                console.error(error);
                break;
            }
        }
    };

    async function getAlreadyPostedEvents(session: Session) {
        let res: CalendarList | GetEventsErrorObject;
        let next_page_token: string = "";
        let already_posted_events: Array<Event> = [];
        const {start, end} = getQuarterRange(parseInt(formState.importYear), formState.importRange);
        do {
            let query_param_obj: object;
            if (next_page_token != "") query_param_obj = {pageToken: next_page_token};
            else
                query_param_obj = {
                    maxResults: 2000,
                    timeMax: end.toISOString(),
                    timeMin: start.toISOString(),
                    orderBy: "startTime",
                    singleEvents: true,
                };
            const google_api_url = `https://www.googleapis.com/calendar/v3/calendars/${formState.toCalendar}/events?${encodeQueryData(query_param_obj)}`;
            const raw_response = await fetch(google_api_url, {
                method: "GET",
                headers: {Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json"},
            });
            res = await raw_response.json();
            // TODO: res.statusが400と500のときのエラー処理
            if (res instanceof GetEventsErrorObject) throw Error(`status ${res.error.code}`);
            if (res.nextPageToken) next_page_token = res.nextPageToken;
            already_posted_events.push(...res.items);
        } while (res.hasOwnProperty("nextPageToken"));
        return already_posted_events;
    }

    class GetEventsErrorObject {
        error: {
            errors: [
                {
                    domain: string;
                    reason: string;
                    message: string;
                }
            ];
            code: number;
            message: string;
        };
    }

    async function addEventToGoogleCal(start: string, title: string) {
        if (!(session && session.user)) return;
        const google_api_url = `https://www.googleapis.com/calendar/v3/calendars/${formState.toCalendar}/events`;
        let res = await fetch(google_api_url, {
            method: "POST",
            headers: {Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json"},
            body: JSON.stringify({
                end: {dateTime: getEndTime(start)},
                start: {dateTime: start},
                summary: title,
                description: "#created_by_dp2gc",
            }),
        });
        if (res.status >= 400) {
            res.json().then((data) => {
                console.log(data);
            });
            throw new Error(`${res.status} : Bad response from server`);
        }
        setImportCount((prevCount) => prevCount + 1);
    }

    // If we sort Event, we can bisect the search by date.
    function isEventDuplicated(already_posted_event_list: Event[], class_event: ClassEvent): boolean {
        for (const already_posted_event of already_posted_event_list) {
            if (!already_posted_event.start.dateTime) {
                continue;
            }
            const is_class_title_same = class_event.title == already_posted_event.summary;
            const is_start_time_same = new Date(class_event.start).toISOString() == new Date(already_posted_event.start.dateTime).toISOString();
            if (is_class_title_same && is_start_time_same) {
                return true;
            }
        }
        return false;
    }

    return (
        <Stack spacing={2} component="form" autoComplete="off" action="/import">
            <FormControl margin="normal">
                <InputLabel id="import-year-label">インポート年度</InputLabel>
                <Select value={formState.importYear} onChange={handleSelectChange} name="importYear" labelId="import-year-label" label="インポート先カレンダー" margin="dense">
                    {selectableYears.map((selectableYear: number, i: number) => (
                        <MenuItem value={selectableYear} key={i}>
                            {selectableYear}
                        </MenuItem>
                    ))}
                </Select>
            </FormControl>
            <ImportRange error={importRangeError} value={formState.importRange} onChange={handleSelectChange} />
            <ToCalendar error={calendarInputError} value={formState.toCalendar} onChange={handleSelectChange} setAccessToken={setAccessToken} />
            <DHUPortalData error={dhuPortalInputError} username={formState.username} password={formState.password} onChange={handleInputChange} />
            <ImportOptions value={formState.ignoreOtherEvents} onChange={handleInputChange} />
            <input type="hidden" name="accessToken" value={accessToken} />
            <br />
            <Button disabled={appState == "unauthenticated" || appState == "connect portal" || appState == "import"} variant="contained" onClick={onImportClick}>
                {appState == "connect portal" ? "デジキャンから読み込んでいます..." : ""}
                {appState == "import" ? `(${importCount}件/${totalImportCount}件)` : ""}
                {appState == "unauthenticated" ? "Googleアカウントにログインしてください" : "インポート"}
            </Button>
        </Stack>
    );
}
