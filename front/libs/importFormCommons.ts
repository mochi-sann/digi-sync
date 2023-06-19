import styled from '@emotion/styled'
import {Button,ButtonProps} from '@mui/material'
import dayjs from 'dayjs'
import * as yup from 'yup'
import { FormInputs } from '../types/formInputsTypes'
import { RawClassEvent } from '../types/types'
import { getQuarterRange, getNowAcademicYear } from './utils'

export const INIT_REQUIRE_VALUE_LIST = ['importRange', 'toCalendar', 'username', 'password']



export const FORM_STATE_DEFAULT_VALUE: FormInputs = {
    importYear: getNowAcademicYear().toString(),
    importRange: '',
    username: '',
    password: '',
    ignoreOtherEvents: true,
} as FormInputs

export function excludeOutOfImportRange(
    formState: FormInputs,
    class_events: RawClassEvent[],
): RawClassEvent[] {
    const { start: start_date, end: end_date } = getQuarterRange(
        parseInt(formState.importYear),
        formState.importRange,
    )
    const start = start_date.unix()
    const end = end_date.unix()
    console.log('class_events', class_events)
    return class_events.filter((class_event) => {
        const start_date = dayjs(class_event.start).unix()
        return start_date > start && start_date < end
    })
}

export async function fetchClassEventList(formState: FormInputs): Promise<RawClassEvent[]> {
    let res: Response
    let event_list: RawClassEvent[]
    const query_param_obj = {
        importYear: formState.importYear,
        importRange: formState.importRange,
        username: formState.username,
        password: formState.password,
    }
    const query_param_str = new URLSearchParams(query_param_obj).toString()
    try {
        res = await fetch(process.env.NEXT_PUBLIC_API_DOMAIN + '/class_events?' + query_param_str, {
            method: 'GET',
        })

        if (!res.ok) throw new Error()
        event_list = await res.json()
        console.log('res', res)
    } catch {
        throw new Error('デジキャンに接続できませんでした')
    }
    return event_list
}

export const getSelectableYearList = (): number[] => {
    return new Array<number>(dayjs().year() - 1, dayjs().year(), dayjs().year() + 1)
}

export const FORM_SCHEMA_SHAPE = {
    importYear: yup.number(),
    importRange: yup.string().required('インポートする範囲を選択してください'),

    username: yup.string().required('入力してください'),
    password: yup.string().required('入力してください'),
    ignoreOtherEvents: yup.boolean(),
}

export const NonTextTransformButton = styled(Button)<ButtonProps>(() => ({
    textTransform: 'none',
}))