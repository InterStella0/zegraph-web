import dynamic from 'next/dynamic'
import GraphSkeleton from "./GraphSkeleton"
import { Skeleton } from "components/ui/skeleton"
import type * as Charts from './chartSetup'

type ChartKind = 'Bar' | 'Line' | 'Doughnut' | 'PolarArea' | 'Chart'

const lazyChart = <K extends ChartKind>(kind: K, loading = () => <GraphSkeleton />) =>
    dynamic(() => import('./chartSetup').then(mod => ({ default: mod[kind] as any })), { ssr: false, loading }) as (typeof Charts)[K]

export const LazyBarChart = lazyChart('Bar')
export const LazyLineChart = lazyChart('Line')
export const LazyDoughnutChart = lazyChart('Doughnut')
export const LazyPolarAreaChart = lazyChart('PolarArea')
export const LazyMatrixChart = lazyChart('Chart', () => <Skeleton className="w-full h-[150px]" />)
