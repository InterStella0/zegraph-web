import {Chart, registerables} from 'chart.js';
import {MatrixController, MatrixElement} from 'chartjs-chart-matrix';
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-dayjs-4/dist/chartjs-adapter-dayjs-4.esm';

// The one Chart.js registry. LazyCharts loads this chunk on the client only, so chart code stays off first paint.
// Annotation and zoom are inert unless a chart configures them.
Chart.register(...registerables, MatrixController, MatrixElement, annotationPlugin, zoomPlugin);

export {Bar, Line, Doughnut, PolarArea, Chart} from 'react-chartjs-2';
