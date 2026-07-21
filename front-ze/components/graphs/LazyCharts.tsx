import dynamic from 'next/dynamic'
import GraphSkeleton from "./GraphSkeleton"

export const LazyBarChart = dynamic(
  () => import('react-chartjs-2').then(mod => ({ default: mod.Bar })),
  {
    ssr: false,
    loading: () => <GraphSkeleton />
  }
)

export const LazyLineChart = dynamic(
  () => import('react-chartjs-2').then(mod => ({ default: mod.Line })),
  {
    ssr: false,
    loading: () => <GraphSkeleton />
  }
)

export const LazyDoughnutChart = dynamic(
  () => import('react-chartjs-2').then(mod => ({ default: mod.Doughnut })),
  {
    ssr: false,
    loading: () => <GraphSkeleton />
  }
)

export const LazyPolarAreaChart = dynamic(
  () => import('react-chartjs-2').then(mod => ({ default: mod.PolarArea })),
  {
    ssr: false,
    loading: () => <GraphSkeleton />
  }
)

export const LazyMatrixChart = dynamic(
  () => import('react-chartjs-2').then(mod => ({ default: mod.Chart })),
  {
    ssr: false,
    loading: () => <GraphSkeleton />
  }
)
