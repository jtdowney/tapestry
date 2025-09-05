import Sidebar from './Sidebar.svelte';

import { handleDOMReady, mountApp } from '$shared/mount';
import '../app.css';

handleDOMReady(() => mountApp(Sidebar));
