import {
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogContentText,
    DialogTitle,
    Fade,
} from '@mui/material'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { encodeQueryData, GetEventsErrorObject, isGetEventErrorObject } from '../../libs/utils'
import type { CalendarList, Event } from '../../types/gapi_calendar'

type Props = {
    disabled: boolean
}
let delete_event_url_list: string[]

export default function AllDeleteButton({ disabled }: Props) {
    const [isShowDialog, setIsShowDialog] = useState(false)
    const [deleteEventCout, setDeleteEventCout] = useState(0)
    const [deleteStatus, setDeleteStatus] = useState<
        'unauthenticated' | 'ready' | 'getting_calendar' | 'deleting'
    >('unauthenticated')
    const [deleteCount, setDeleteCount] = useState(0)
    const { data: session, status: authStatus } = useSession()

    useEffect(() => {
        if (authStatus == 'unauthenticated') setDeleteStatus('unauthenticated')
        else setDeleteStatus('ready')
    }, [authStatus])

    const onAllDeleteClick = async () => {
        setDeleteStatus('getting_calendar')
        delete_event_url_list = []
        // すべてのカレンダーを取得
        if (!(session && session.user)) return
        const res: Response = await fetch(
            'https://www.googleapis.com/calendar/v3/users/me/calendarList',
            {
                method: 'GET',
                headers: { Authorization: `Bearer ${session.accessToken}` },
            },
        )
        const all_calendar_list = (await res.json()).items

        // すべてのカレンダーの予定を取得
        const all_events = new Map<string, Event[]>()
        for (const calendar of all_calendar_list) {
            const query_param = {
                maxResults: 2000,
                orderBy: 'startTime',
                singleEvents: true,
            }
            console.log(
                `https://www.googleapis.com/calendar/v3/calendars/${
                    calendar.id
                }/events?${encodeQueryData(query_param)}`,
            )

            const google_api_url = `https://www.googleapis.com/calendar/v3/calendars/${
                calendar.id
            }/events?${encodeQueryData(query_param)}`
            const raw_response = await fetch(google_api_url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${session.accessToken}`,
                    'Content-Type': 'application/json',
                },
            })
            const res: CalendarList | GetEventsErrorObject = await raw_response.json()
            if (isGetEventErrorObject(res)) {
                console.error(res)
                continue
            }
            all_events.set(
                calendar.id,
                res.items.filter(
                    (event) => event.description && event.description.includes('#created_by_dp2gc'),
                ),
            )
        }
        // 取得した予定の中から詳細に#dp2gcがあるものだけを残すようフィルタリング
        const delete_events = all_events
        let delete_count = 0
        delete_events.forEach((events) => {
            delete_count += events.length
        })
        setDeleteEventCout(delete_count)
        delete_events.forEach((events, k) => {
            for (const delete_event of events) {
                delete_event_url_list.push(
                    `https://www.googleapis.com/calendar/v3/calendars/${k}/events/${delete_event.id}`,
                )
            }
        })
        // フィルタリングしたものを消していいかどうかホップアップを出す
        setIsShowDialog(true)
    }

    const handleClose = () => {
        setIsShowDialog(false)
        setDeleteStatus('ready')
    }

    const allDelete = async () => {
        setIsShowDialog(false)
        setDeleteStatus('deleting')
        setDeleteCount(0)
        handleClose()
        if (!session) return
        console.log()
        for (const delete_url of delete_event_url_list) {
            console.log(delete_url)
            fetch(delete_url, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${session.accessToken}`,
                    'Content-Type': 'application/json',
                },
            })
            setDeleteCount((deleteCount) => deleteCount + 1)
            await new Promise(function (resolve) {
                setTimeout(resolve, 250)
            })
        }
        setDeleteStatus('ready')
    }

    return (
        <>
            <Button disabled={deleteStatus != 'ready'} color='error' onClick={onAllDeleteClick}>
                {
                    {
                        unauthenticated: 'Googleアカウントにログインしてください',
                        ready: 'デジシンクによって追加した予定をすべて消す',
                        deleting: `${deleteCount}件削除済み`,
                        getting_calendar:
                            'カレンダーからデジシンクによって追加された予定を検索中(30秒ほどかかります)',
                    }[deleteStatus]
                }
                <Fade in={deleteStatus == 'getting_calendar'}>
                    <CircularProgress />
                </Fade>
            </Button>
            <Dialog
                open={isShowDialog}
                aria-labelledby='alert-dialog-title'
                aria-describedby='alert-dialog-description'
            >
                <DialogTitle id='alert-dialog-title'>予定を削除しますか？</DialogTitle>
                <DialogContent>
                    <DialogContentText id='alert-dialog-description'>
                        {`デジシンクによって追加された予定(${deleteEventCout}件)を削除します`}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClose} autoFocus>
                        いいえ
                    </Button>
                    <Button onClick={allDelete}>はい、削除します</Button>
                </DialogActions>
            </Dialog>
        </>
    )
}
