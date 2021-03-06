const storage = require('electron-json-storage')
const settings = require('electron-settings')
const {dialog} = require('electron').remote
const Vue = require('vue/dist/vue.js')
var Split = require('split.js')
let main_modules = require('./modules.js')

var app = new Vue({
    el: '#app',
    data: {
        entries: [],
        
        // a default or 'blank' entry, used:
        // - when the application starts and there isn't a last_selected_word set
        // - when a new entry is created
        // - when an entry is deleted and the detail view needs to be cleared
        null_entry: {},

        // the selected entry
        current_entry: null,

        // the temp_entry is used for saving the original entry while editing
        temp_entry:    null,

        // the mode - either 'view' or 'edit'
        mode: 'view',

        // modules to be shown in the detail view
        modules: ['module-word', 'module-definition', 'module-tags', 'module-synonyms'],

        // the value of the search field at the top of the entry list
        search_text: ''
    },
    components: main_modules,
    methods: {

        load_from_storage: function() {
            let storage_path = settings.get('storage_path');
            storage.setDataPath(storage_path);
            let app = this;
            storage.getAll(function(error, entries) {
                if (error) {
                    console.log(error);
                } else {

                    // add the entries to the app's entries
                    // electron-storage loads the entries as a single object
                    // with each entry as an attribute of that object
                    // rather than as an array
                    app.entries = [];
                    for (name in entries) {
                        let entry = entries[name]

                        // copy attributes from the null_entry
                        // to ensure that every module has the attributes it's expecting
                        for (field in app.null_entry) {
                            if (!entry.hasOwnProperty(field)) {
                                entry[field] = app.null_entry[field]
                            }
                        }
                        app.entries.push(entry)
                    }
                    
                    // load the last selected word
                    let last_selected_word  = settings.get('last_selected_word', null);
                    let found_entry = app.entries.find((entry) => {
                        return entry.word === last_selected_word;
                    });
                    if (found_entry) {
                        app.current_entry = found_entry;
                    }  else {
                        app.current_entry = app.copy_entry(app.null_entry);
                    }
                }
            });
        },

        view_entry: function(entry) {
            if (this.mode === 'edit') {
                let app = this
                show_alert({
                    message: 'cancel edit?',
                    buttons: ['yes', 'no'],
                    callback: function(response) {
                        if (response === 'yes') {
                            this.mode = 'view'
                        } else {
                            app.current_entry = entry
                        }
                    }
                });
            } else {
                this.current_entry = entry
            }
        },
        new_entry: function() {
            this.current_entry = this.copy_entry(this.null_entry)
            this.mode = 'edit'
            
            setTimeout(function() {
                let input_word = document.querySelector('#input_word')
                if (input_word) { // maybe the module wasn't added
                    input_word.focus()
                }
            }, 50)

        },
        edit_entry: function() {
            this.mode = 'edit'
        },
        cancel_edit: function() {
            this.temp_entry = this.copy_entry(this.current_entry);
            this.mode = 'view'
        },
        save_entry: function() {

            // check if the input word is blank
            if (this.temp_entry.word === '') {
                show_alert({
                    message: 'the word cannot be blank',
                    buttons: ['ok'],
                    callback: function(response) {}
                });
                return;
            }


            // check if the word's been changed or newly created
            if (this.temp_entry.word !== this.current_entry.word) {

                // check if the saved word already exists
                let app = this;
                let found_index = this.entries.find(function(entry) {
                    return entry.word === app.temp_entry.word;
                });
                if (found_index >= 0) {
                    show_alert({
                        message: 'the word must be unique',
                        buttons: ['ok'],
                        callback: function(response) {}
                    });
                    return;
                }
                
                if (this.current_entry.word !== '') {
                    // remove the 'old' word
                    storage.remove(this.current_entry.word, function(error) {
                        if (error) {
                            console.log(error);
                        }
                    });
                }
            }

            // add the new entry to the entries
            // or replace the current_entry with the temp_entry in entries
            let app = this;
            let index = this.entries.findIndex(function(entry) {
                return entry === app.current_entry;
            });
            if (index >= 0) {
                this.entries[index] = this.temp_entry;
            } else {
                this.entries.push(this.temp_entry);
            }
            this.current_entry = this.temp_entry;

            // sort the entries to keep them in alphabetical order
            this.entries.sort(function(e0, e1) {
                return e0.word.localeCompare(e1.word);
            });

            // switch the mode to view
            this.mode = 'view'

            // save the word
            storage.set(this.current_entry.word, this.current_entry, function(error) {
                if (error) {
                    console.log(error);
                }
            });
        },
        delete_entry: function() {
            let app = this;
            show_alert({
                message: 'are you sure?',
                buttons: ['yes', 'no'],
                callback: function(response) {
                    if (response === 'yes') {
                        storage.remove(app.current_entry.word, function(error) {
                            if (error) {
                                console.log(error);
                            } else {
                                let index = app.entries.findIndex(function(entry) {
                                    return entry === app.current_entry;
                                });
                                app.entries.splice(index, 1);
                                app.current_entry = app.copy_entry(app.null_entry);
                                app.mode = 'view';
                            }
                        });
                    }
                }
            });
        },
        copy_entry: function(entry) {
            return JSON.parse(JSON.stringify(entry))
        },
        filtered_entries: function() {
            let st = this.search_text;
            let cind = st.indexOf(':');
            if (cind >= 0) {
                let name = st.substring(0, cind);
                st = st.substring(cind+1);
            }
            
            let filtered_entries = this.entries.filter((entry) => {
                if (cind >= 0) {
                    if (name === 'word') {
                        return entry.word.includes(st);
                    } else if (name === 'def' || name === 'definition') {
                        return entry.definition.includes(st);
                    } else if (name === 'tag') {
                        return entry.tags.includes(st);
                    }
                }
                return entry.word.includes(st) || entry.definition.includes(st) || entry.tags.includes(st);
            });
            return filtered_entries;
        },
        select_tag: function(tag_name) {
            this.search_text = 'tag:'+tag_name
        },
        select_entry: function(word) {
            let entry = this.entries.find((entry) => {
                return entry.word === word;
            });
            if (entry) {
                this.current_entry = entry;
            }
        },
        get_module_title(module_name) {
            if (this.$refs) {
                module = this.$refs[module_name]
                if (module) {
                    return module[0].name
                }
            }
            
        }
    },
    watch : {
        current_entry: function(val) {
            this.temp_entry = this.copy_entry(this.current_entry);
        }
    },
    created: function () {

        let components = this.$options.components
        for (let i=0; i<this.modules.length; ++i) {
            let default_values = components[this.modules[i]].data().default_values
            for (default_field in default_values) {
                this.null_entry[default_field] = default_values[default_field]
            }
        }
        console.log(this.null_entry)


        //settings.deleteAll();
        if (!settings.has('storage_path')) {
            let result = dialog.showOpenDialog({properties: ['openDirectory']});
            settings.set('storage_path', result[0]);
        }
        this.current_entry = this.copy_entry(this.null_entry);
        this.temp_entry = this.copy_entry(this.null_entry);
        this.load_from_storage();

        this.search_text = settings.get('last_search_text', '');
    }
});




function show_alert(obj) {

    let div_alert_background = document.querySelector('#div_alert_background');
    let div_alert_text = document.querySelector('#div_alert_text');
    let div_alert_buttons = document.querySelector('#div_alert_buttons');

    div_alert_text.innerText = obj.message;
    while (div_alert_buttons.hasChildNodes()) {
        div_alert_buttons.removeChild(div_alert_buttons.firstChild);
    }
    for (let i=0; i<obj.buttons.length; ++i) {
        let div_bt = document.createElement('div');
        div_bt.innerText = obj.buttons[i];
        div_bt.onclick = function() {
            div_alert_background.style.display = 'none';
            obj.callback(this.innerText);
        }
        div_alert_buttons.appendChild(div_bt);
    }
    div_alert_background.style.display = 'block';
}

window.onbeforeunload = function (e) {
    settings.set('last_selected_word', app.current_entry.word);
    settings.set('last_search_text', app.search_text);
}


Split(['#div_entries', '#div_detail'], {
    sizes: [20, 80],
    gutterSize: 20,
    minSize: [5, 5],
    direction: 'horizontal',
    cursor: 'col-resize',
    snapOffset: 0
});