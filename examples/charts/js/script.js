
    var config;

$(document).ready(function(){
    var statewide_contest_template = Handlebars.compile($("#statewide-contest-template").html());
    var county_results_template = Handlebars.compile($("#county-results-template").html());
    var result_row_template = Handlebars.compile($("#result-row-template").html());
    var result_table_template = Handlebars.compile($("#result-table-template").html());
    var proposition_results_template = Handlebars.compile($("#proposition-results-template").html());
    var election;
    var router;
    
    var presidential_view, ussenate_view, ushouse_view, casenate_view, caassembly_view, propositions_view;
    var county_map_view, assembly_district_view, house_district_view, senate_district_view;
    Handlebars.registerHelper('result_table_template', result_table_template);
    Handlebars.registerHelper('county_results_template', county_results_template);

    var Config = Backbone.Model.extend({
        // body, contest, county
        redraw_features : function () {
            var cfg = this;
            var feature_sets = this.get("map_feature_sets");
            _.each(feature_sets, function(feature_set_name)
            {
                var feature_set = cfg.get(feature_set_name);
                
                _.each(feature_set, function(feature)
                {
                    feature.redraw();

                });
            });
            
        },

        defaults: {
            body : "",
            contest: "ca",
            county: "",
            showcounties: false,
            showassembly: false,
            showsenate: false,
            showushouse: false,
            map: new google.maps.Map(document.getElementById("map-canvas"), {
                center: new google.maps.LatLng(38.5, -121.5), // near Sacramento
                zoom: 5,
                mapTypeId: google.maps.MapTypeId.ROADMAP,
                styles: map_styles,
                scrollwheel: false,
                streetViewControl: false,
                mapTypeControl: false
            }),
            map_feature_sets: [],

        }


    });

    var Election = Backbone.Collection.extend({
        // last_updated
        model: Body,
        parse_bodies: function(bodies){
            var the_election = this;
            _.each(bodies, function(body, name)
            {
                var newbody = new Body({ name : name, title: body.title });
                the_election.add(newbody);
                newbody.parse_contests(body.contests);

            });

        }

    });

    var Body = Backbone.Model.extend({
        // Name - e.g. us.president
        // Contests
        //

        parse_contests : function(contests){
            var the_body = this;
            var the_contests = new Contests();

            _.each(contests, function (contest, name)
            {
                var newcontest = new Contest({
                    name: name,
                    body: the_body,
                    longname: contest.longname,
                    geo: contest.geo,
                    precincts_total: contest.precincts.total,
                    precincts_reporting: contest.precincts.reporting,
                    precincts_reporting_percent: contest.precincts.reporting_percent
                });
                newcontest.parse_candidates(contest.candidates);
                if (_.has(contest, 'counties'))
                {
                    var counties = new Counties();
                    _.each(contest.counties, function (county, name)
                    {
                        var newcounty = new County({
                            name: name,
                            title: county.title,
                            geo: county.geo,
                            candidates: county_votes_to_candidates(county.votes, newcontest.get("candidates")),
                            precincts_total: county.precincts.total,
                            precincts_reporting: county.precincts.reporting,
                            precincts_reporting_percent: county.precincts.reporting_percent


                        });
                        counties.add(newcounty);



                    });
                    newcontest.set('counties', counties);
                }
                else
                {
                    newcontest.set('counties', null);
                }
                the_contests.add(newcontest);
            });
            the_body.set("contests", the_contests);

        }

    });

    var Contest = Backbone.Model.extend({
        // Name 
        // Longname
        // Geo
        // Candidates
        // Precincts_reporting
        // Precincts_total
        // Precincts_reporting_percent
        parse_candidates : function(candidates){
            var the_contest = this;
            var the_candidates = new Candidates();
            _.each(candidates, function(candidate, id)
            {
                var new_candidate = new Candidate(candidate);
                the_candidates.add(candidate);

            });
            the_contest.set('candidates', the_candidates);

        }
    });
    var Contests = Backbone.Collection.extend({
        model : Contest

    });

    var County = Backbone.Model.extend({
        // id
        // title
        // geo
        // votes
        // Precincts_reporting
        // Precincts_total
        // Precincts_reporting_percent


    });

    var Counties = Backbone.Collection.extend({
        model : County
    });

    function county_votes_to_candidates(votes, candidates)
    {
        return new Candidates(_.map(votes, function(vote, candidate_id)
        {
            var new_candidate = candidates.get(candidate_id).clone();
            new_candidate.set(votes); // Override vote data

            return new_candidate;

            

        }));
    }
    var Candidate = Backbone.Model.extend({
        // name
        // id
        // ballot_name
        // last_name
        // votes
        // vote_percent

    });

    var Candidates = Backbone.Collection.extend({
        model: Candidate,
        comparator: function(candidate)
        {
            // Sort them in decreasing order of vote percentage
            return -1 * candidate.get("vote_percent");

        }

    });

        
        

        
    var StatewideContestView = Backbone.View.extend({
        tagName: "div",
        id: "statewide-contest-results",
        render: function(county_name) {
            var json = this.model.toJSON();
            json.body_title = json.body.get("title");
            json.candidates = json.candidates.toJSON(); // Need this as object too

            if(!_.isUndefined(county_name))
            {
                // Not yet implemented -- need to see final version of sample.json
                var county_results = json.counties.where({title: county_name});
                if (county_results.length > 0)
                {
                   json.county_results = county_results.pop().toJSON();
                   json.county_results.candidates = json.county_results.candidates.toJSON();
                }

            }

            $(this.el).html(statewide_contest_template(json));
            $('#chart-canvas').html($(this.el)); 
            county_map_view.render(county_name);
            return this;
        }
    });

    var PropositionsView = Backbone.View.extend({
        tagName: "div",
        id: "proposition-contest-results",
        render: function(county_name) {
            var json = {};
            json.body_title = this.model.get("title");
            json.propositions = this.model.get("contests").toJSON();
            _.each(json.propositions, function(proposition) {
                proposition.candidates = proposition.candidates.toJSON();

            });

            if(!_.isUndefined(county_name))
            {
            }
            j = json;

            $(this.el).html(proposition_results_template(json));
            $('#chart-canvas').html($(this.el));
            county_map_view.render(county_name);

            
            

        }

    });

    function county_responsive_unselected_opts () {
        if(config.get("county") == this.id)
        {
            
            // Unselect yourself on mouseout
            config.set({county: ''});

        }

        if (!config.get("showcounties"))
        {
            return {visible: false};
        }
        if (config.get("body") == "propositions")
        {
        

        }

        return {fillColor: "#999", fillOpacity: 0.7, visible: true};
    }
    function county_responsive_highlighted_opts () {
        if (!config.get("showcounties"))
        {
            return {visible: false};
        }

        return {fillColor: "#ffcc33", fillOpacity: 0.7, visible: true};

    }
    var CountyMapView = Backbone.View.extend({
        tagname: "div",
        id: "the-map",
        render: function(county_name)
        {
            if(!config.has("county_features"))
            {
               $.get("kml/california_counties_use_simplified.kml", function (data) {
                var features = gmap.load_polygons({
                    map: config.get("map"),
                    data: data,
                    data_type: "kml",
                    idselector: 'Data[name="NAME00"] value',
                    highlightCallback : function () {
                        var countyname = this.id;
                        config.set({county: countyname});


                    },
                    responsive_unselected_opts: county_responsive_unselected_opts,

                    responsive_highlighted_opts: county_responsive_highlighted_opts


               });
                config.set("county_features", features, {silent: true});
                var config_features = config.get("map_feature_sets");
                config_features.push("county_features");
                config.set("map_feature_sets", config_features, {silent: true});
                });
            

            }
        }

    });

    

    var Router = Backbone.Router.extend({
        routes : {
           "body/:body" : "navto",
           "body/:body/:contest" : "navto",
           "body/:body/:contest/" : "navto",
           "body/:body/:contest/:county/" : "navto",
           "body/:body/:contest/:county" : "navto"
        },
        navto: function(body, contest, county) {
            config.set({body : body || 'presidential', contest: contest || 'ca', county : county || '' }, {silent: true});
            this.show (body, contest, county);
        },

        show: function(body, contest, county) {
            if (body == "presidential")
            {
                presidential_view.render(county);
                config.set({
                    showcounties: true,
                    showassembly: false,
                    showsenate: false,
                    showushouse: false

                });

            }
            if (body == "ussenate")
            {
                ussenate_view.render(county);
                config.set({
                    showcounties: true,
                    showassembly: false,
                    showsenate: false,
                    showushouse: false

                });
            }
            else if (body == "ushouse")
            {
            }
            else if (body == "casenate")
            {
            }
            else if (body == "caassembly")
            {
            }
            else if (body == "capropositions")
            {
                propositions_view.render(county);
                config.set({
                    showcounties: true,
                    showassembly: false,
                    showsenate: false,
                    showushouse: false

                });
            }
            else {
                config.set({body : 'presidential'});
                config.set({
                    showcounties: true,
                    showassembly: false,
                    showsenate: false,
                    showushouse: false

                });

            }
            $('.button').removeClass('button-selected');
            $('#' + body + '-button').addClass('button-selected');
            

        }

    });


    $.getJSON("data/foo.json", function(data)
    {
        election = new Election();
        election.parse_bodies(data.bodies);
        presidential_view = new StatewideContestView({model: election.where({name: 'us.president'}).pop().get("contests").at(0)});
        ussenate_view = new StatewideContestView({model: election.where({name: 'us.senate'}).pop().get("contests").at(0)});
        propositions_view = new PropositionsView({model: election.where({name: 'ca.propositions'}).pop()});


        county_map_view = new CountyMapView();
        router = new Router();
        config = new Config();

        config.on("change", function(){
            router.navigate("#body/" + config.get("body") + "/" + config.get("contest") + "/" + config.get("county"), {trigger: true});
        });
        config.on("change:body", function(){
            config.redraw_features();

        });
        $('.button').click(function(){
            var which_body = $(this).attr('id').split("-")[0];
            config.set({body: which_body});

        });

        if(!Backbone.history.start())
        {
            // By default start with presidential with no specific county
            config.set({body: 'presidential'});
        }



    });



});
