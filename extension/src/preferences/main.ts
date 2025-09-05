import Preferences from './Preferences.svelte';

import { handleDOMReady, mountApp } from '$shared/mount';
import '../app.css';

handleDOMReady(() => mountApp(Preferences));
